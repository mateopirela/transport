import { describe, expect, it } from 'vitest';

import {
  effectiveStatus,
  effectiveUnloadEstimate,
  flushQueue,
  isRetryableError,
  nextOccurredAt,
  parseStoredQueue,
  pendingEvents,
  photoMustWait,
  pruneSent,
  unconfirmedActions,
  type QueuedAction,
} from './trip-queue';

const TRIP = '7f1c2a8e-4b6d-4c3e-9a1f-2d5e6f708192';
const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`;

function step(
  event: Extract<QueuedAction, { kind: 'status' }>['event'],
  occurredAt: string,
  tripId = TRIP,
): QueuedAction {
  return {
    kind: 'status',
    id: uuid(),
    tripId,
    event,
    occurredAt,
    lat: 25.6866,
    lng: -100.3161,
    accuracyM: 12,
    estimatedUnloadEndAt: event === 'unloading_started' ? '2026-10-16T08:00:00-06:00' : null,
  };
}

function estimate(occurredAt: string, at: string): QueuedAction {
  return { kind: 'estimate', id: uuid(), tripId: TRIP, occurredAt, estimatedUnloadEndAt: at };
}

describe('stored queue', () => {
  it('round-trips pending and sent actions and drops corrupt entries', () => {
    const pending = [
      step('departed', '2026-10-15T10:00:00.000Z'),
      estimate('2026-10-15T11:00:00.000Z', '2026-10-16T10:00:00.000Z'),
    ];
    const sent = [step('departed', '2026-10-14T10:00:00.000Z', OTHER)];
    expect(parseStoredQueue(JSON.stringify({ pending, sent }))).toEqual({ pending, sent });
    expect(
      parseStoredQueue(JSON.stringify({ pending: [{ kind: 'status', id: 'x' }, pending[0]] })),
    ).toEqual({ pending: [pending[0]], sent: [] });
  });

  it('is empty for missing or invalid data', () => {
    const empty = { pending: [], sent: [] };
    expect(parseStoredQueue(null)).toEqual(empty);
    expect(parseStoredQueue('not json')).toEqual(empty);
    expect(parseStoredQueue('[1, 2]')).toEqual(empty);
    expect(parseStoredQueue('{"pending": 1}')).toEqual(empty);
  });

  it('keeps sent actions until a loaded trip shows them', () => {
    const departed = step('departed', '2026-10-15T10:00:00.000Z');
    const arrived = step('arrived_at_pickup', '2026-10-15T11:00:00.000Z');
    const other = step('departed', '2026-10-15T09:00:00.000Z', OTHER);
    const loading = step('loading_started', '2026-10-15T12:00:00.000Z');
    const stored = { sent: [departed, arrived, other], pending: [loading] };

    // The saved trip still lacks both sent steps: it shows them as done anyway.
    const all = unconfirmedActions(stored, new Set());
    expect(all).toEqual([departed, arrived, other, loading]);
    expect(effectiveStatus('assigned', all, TRIP)).toBe('loading');
    // A fresher trip already shows the departure.
    expect(unconfirmedActions(stored, new Set([departed.id]))).toEqual([arrived, other, loading]);

    expect(pruneSent(stored.sent, { id: TRIP, recordedIds: new Set([departed.id]) })).toEqual([
      arrived,
    ]);
    expect(pruneSent(stored.sent, null)).toEqual([]);
  });
});

describe('effective trip state', () => {
  const queue = [
    step('departed', '2026-10-15T10:00:00.000Z'),
    step('arrived_at_pickup', '2026-10-15T11:00:00.000Z'),
    step('departed', '2026-10-15T09:00:00.000Z', OTHER),
  ];

  it('applies the queued steps of the trip', () => {
    expect(pendingEvents(queue, TRIP)).toEqual(['departed', 'arrived_at_pickup']);
    expect(effectiveStatus('assigned', queue, TRIP)).toBe('at_pickup');
    expect(effectiveStatus('assigned', [], TRIP)).toBe('assigned');
  });

  it('falls back to the server status when the queue no longer follows', () => {
    expect(effectiveStatus('cancelled', queue, TRIP)).toBe('cancelled');
    expect(effectiveStatus('in_transit', queue, TRIP)).toBe('in_transit');
  });

  it('uses the latest queued estimate of the end of unloading', () => {
    const start = step('unloading_started', '2026-10-15T12:00:00.000Z');
    const update = estimate('2026-10-15T13:00:00.000Z', '2026-10-17T08:00:00.000Z');
    expect(effectiveUnloadEstimate(null, [], TRIP)).toBeNull();
    expect(effectiveUnloadEstimate('2026-10-15T20:00:00.000Z', [], TRIP)).toBe(
      '2026-10-15T20:00:00.000Z',
    );
    expect(effectiveUnloadEstimate(null, [start], TRIP)).toBe('2026-10-16T08:00:00-06:00');
    expect(effectiveUnloadEstimate(null, [start, update], TRIP)).toBe('2026-10-17T08:00:00.000Z');
  });
});

describe('nextOccurredAt', () => {
  const now = new Date('2026-10-15T12:00:00.000Z');

  it('is now when nothing happened later', () => {
    expect(nextOccurredAt([], TRIP, '2026-10-15T11:00:00+00:00', now)).toBe(now.toISOString());
  });

  it('never goes before the last queued or recorded step of the trip', () => {
    const queue = [step('departed', '2026-10-15T12:05:00.000Z')];
    expect(nextOccurredAt(queue, TRIP, null, now)).toBe('2026-10-15T12:05:00.000Z');
    expect(nextOccurredAt([], TRIP, '2026-10-15T12:03:00+00:00', now)).toBe(
      '2026-10-15T12:03:00.000Z',
    );
    expect(nextOccurredAt(queue, OTHER, null, now)).toBe(now.toISOString());
  });
});

describe('isRetryableError', () => {
  it('retries network failures, expired sessions and server hiccups', () => {
    expect(isRetryableError(new TypeError('Network request failed'))).toBe(true);
    expect(isRetryableError({ message: 'TypeError: Network request failed', code: '' })).toBe(true);
    expect(isRetryableError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(isRetryableError({ code: '40001' })).toBe(true);
    expect(isRetryableError({ code: '57014' })).toBe(true);
    expect(isRetryableError({ code: 'XX000', status: 503 })).toBe(true);
  });

  it('does not retry refusals of the RPCs', () => {
    expect(isRetryableError({ code: '55000', message: 'cannot record departed' })).toBe(false);
    expect(isRetryableError({ code: '22023', message: 'occurred_at is out of range' })).toBe(false);
    expect(isRetryableError({ code: '42501', message: 'trip not found' })).toBe(false);
  });
});

describe('flushQueue', () => {
  it('sends every action in order', async () => {
    const queue = [
      step('departed', '2026-10-15T10:00:00.000Z'),
      step('arrived_at_pickup', '2026-10-15T11:00:00.000Z'),
    ];
    const sent: string[] = [];
    const result = await flushQueue(queue, (action) => {
      sent.push(action.id);
      return Promise.resolve();
    });
    expect(sent).toEqual(queue.map((a) => a.id));
    expect(result).toEqual({ sent, rejected: [], stopped: false });
  });

  it('stops at a retryable failure and keeps the rest for later', async () => {
    const queue = [
      step('departed', '2026-10-15T10:00:00.000Z'),
      step('arrived_at_pickup', '2026-10-15T11:00:00.000Z'),
      step('loading_started', '2026-10-15T12:00:00.000Z'),
    ];
    let calls = 0;
    const result = await flushQueue(queue, () => {
      calls += 1;
      return calls === 2
        ? Promise.reject(new TypeError('Network request failed'))
        : Promise.resolve();
    });
    expect(calls).toBe(2);
    expect(result).toEqual({ sent: [queue[0]?.id], rejected: [], stopped: true });
  });

  it('drops a refused action with the later ones of its trip only', async () => {
    const departed = step('departed', '2026-10-15T10:00:00.000Z');
    const arrived = step('arrived_at_pickup', '2026-10-15T11:00:00.000Z');
    const other = step('departed', '2026-10-15T10:30:00.000Z', OTHER);
    const result = await flushQueue([departed, other, arrived], (action) =>
      action.id === departed.id
        ? Promise.reject({ code: '55000', message: 'cannot record departed' })
        : Promise.resolve(),
    );
    expect(result).toEqual({ sent: [other.id], rejected: [departed, arrived], stopped: false });
  });
});

describe('receiver at delivery (B23)', () => {
  it('keeps the receiver of the end of unloading and still reads older queues without it', () => {
    const finished = {
      ...step('unloading_finished', '2026-10-15T12:00:00-06:00'),
      receivedBy: 'Rosa',
    };
    const older = step('arrived_at_delivery', '2026-10-15T11:00:00-06:00');
    expect(parseStoredQueue(JSON.stringify({ pending: [older, finished], sent: [] }))).toEqual({
      pending: [older, finished],
      sent: [],
    });
    expect(
      parseStoredQueue(JSON.stringify({ pending: [{ ...finished, receivedBy: '   ' }] })).pending,
    ).toEqual([]);
  });
});

describe('photoMustWait (B23)', () => {
  const at = '2026-10-15T10:00:00-06:00';

  it('lets photos go when nothing of their trip is queued', () => {
    expect(photoMustWait([], TRIP, 'pickup')).toBe(false);
    expect(photoMustWait([step('departed', at, OTHER)], TRIP, 'pickup')).toBe(false);
  });

  it('holds photos behind the steps queued before the step that needs them', () => {
    const queue = [
      step('departed', at),
      step('arrived_at_pickup', at),
      step('loading_started', at),
      step('loading_finished', at),
    ];
    expect(photoMustWait(queue, TRIP, 'pickup')).toBe(true);
    // Once those are sent, the step left waits for the photos, not the reverse.
    expect(photoMustWait(queue.slice(3), TRIP, 'pickup')).toBe(false);
    expect(photoMustWait([step('unloading_finished', at)], TRIP, 'delivery')).toBe(false);
  });

  it('holds delivery and incident photos while any earlier step of the trip is queued', () => {
    const queue = [step('arrived_at_delivery', at), estimate(at, '2026-10-15T12:00:00-06:00')];
    expect(photoMustWait(queue, TRIP, 'delivery')).toBe(true);
    expect(photoMustWait(queue.slice(1), TRIP, 'incident')).toBe(true);
    expect(photoMustWait([step('loading_finished', at)], TRIP, 'delivery')).toBe(true);
  });
});
