import {
  evidenceStageForEvent,
  MAX_RECEIVER_NAME_LENGTH,
  OPERATOR_TRIP_STEPS,
  type EvidenceStage,
  statusAfterEvents,
  type OperatorTripEvent,
  type TripStatus,
} from '@transport/shared';
import { z } from 'zod';

// Offline queue of the operator's trip actions (B21). Pure logic, no React
// Native: what goes in, how the trip looks with it applied, and how it is sent.
//
// Every action keeps the moment it happened on the road (`occurredAt`) and a
// client id that the RPCs use as idempotency key (trip_events.client_event_id),
// so a retry after a lost response never records the event twice.

const statusAction = z.object({
  kind: z.literal('status'),
  id: z.uuid(),
  tripId: z.uuid(),
  event: z.enum(OPERATOR_TRIP_STEPS as [OperatorTripEvent, ...OperatorTripEvent[]]),
  occurredAt: z.iso.datetime({ offset: true }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable(),
  estimatedUnloadEndAt: z.iso.datetime({ offset: true }).nullable(),
  /** Who received the cargo (unloading_finished only, B23). Absent in older queues. */
  receivedBy: z.string().trim().min(1).max(MAX_RECEIVER_NAME_LENGTH).nullable().optional(),
});

const estimateAction = z.object({
  kind: z.literal('estimate'),
  id: z.uuid(),
  tripId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  estimatedUnloadEndAt: z.iso.datetime({ offset: true }),
});

const queuedAction = z.discriminatedUnion('kind', [statusAction, estimateAction]);

export type QueuedStatusAction = z.output<typeof statusAction>;
export type QueuedEstimateAction = z.output<typeof estimateAction>;
export type QueuedAction = z.output<typeof queuedAction>;

/**
 * What the phone keeps: actions still to send, and actions the server already
 * accepted but that the last loaded trip does not show yet (so a reload that
 * fails right after sending never shows a step as undone).
 */
export interface StoredQueue {
  pending: QueuedAction[];
  sent: QueuedAction[];
}

export const EMPTY_STORED_QUEUE: StoredQueue = { pending: [], sent: [] };

function parseActions(value: unknown): QueuedAction[] {
  if (!Array.isArray(value)) return [];
  // A corrupt entry is dropped instead of blocking the ones after it.
  return value.flatMap((entry) => {
    const parsed = queuedAction.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Reads a stored queue; anything unreadable counts as empty. */
export function parseStoredQueue(raw: string | null): StoredQueue {
  if (!raw) return EMPTY_STORED_QUEUE;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY_STORED_QUEUE;
    const { pending, sent } = value as Record<string, unknown>;
    return { pending: parseActions(pending), sent: parseActions(sent) };
  } catch {
    return EMPTY_STORED_QUEUE;
  }
}

/**
 * Actions a loaded trip does not reflect yet, in order: the sent ones missing
 * from its timeline (matched by client_event_id), then the pending ones.
 */
export function unconfirmedActions(
  stored: StoredQueue,
  recordedIds: ReadonlySet<string>,
): QueuedAction[] {
  return [...stored.sent.filter((a) => !recordedIds.has(a.id)), ...stored.pending];
}

/**
 * Sent actions still worth keeping after loading `trip` from the server: only
 * the ones of that trip that its timeline does not show yet.
 */
export function pruneSent(
  sent: readonly QueuedAction[],
  trip: { id: string; recordedIds: ReadonlySet<string> } | null,
): QueuedAction[] {
  return sent.filter((a) => trip !== null && a.tripId === trip.id && !trip.recordedIds.has(a.id));
}

const forTrip = (queue: readonly QueuedAction[], tripId: string) =>
  queue.filter((action) => action.tripId === tripId);

/** Status events of a trip still waiting in the queue, in order. */
export function pendingEvents(queue: readonly QueuedAction[], tripId: string): OperatorTripEvent[] {
  return forTrip(queue, tripId).flatMap((a) => (a.kind === 'status' ? [a.event] : []));
}

/**
 * Status the operator sees: the server status with the queued events applied.
 * If they no longer follow from it (the trip changed elsewhere), the server
 * status wins; sending the queue will reject them.
 */
export function effectiveStatus(
  serverStatus: TripStatus,
  queue: readonly QueuedAction[],
  tripId: string,
): TripStatus {
  return statusAfterEvents(serverStatus, pendingEvents(queue, tripId)) ?? serverStatus;
}

/** Latest estimated end of unloading of a trip, counting the queued ones. */
export function effectiveUnloadEstimate(
  serverEstimate: string | null,
  queue: readonly QueuedAction[],
  tripId: string,
): string | null {
  let estimate = serverEstimate;
  for (const action of forTrip(queue, tripId)) {
    if (action.estimatedUnloadEndAt) estimate = action.estimatedUnloadEndAt;
  }
  return estimate;
}

/**
 * Moment to record a new action: now, but never before the last one of the
 * trip (queued or on the server). The server rejects events out of order, and
 * the device clock may have been adjusted between two taps.
 */
export function nextOccurredAt(
  queue: readonly QueuedAction[],
  tripId: string,
  lastServerEventAt: string | null,
  now: Date,
): string {
  let latest = now.getTime();
  const times = forTrip(queue, tripId).map((a) => a.occurredAt);
  if (lastServerEventAt) times.push(lastServerEventAt);
  for (const time of times) latest = Math.max(latest, Date.parse(time));
  return new Date(latest).toISOString();
}

/**
 * Whether a photo of `stage` must wait for queued actions of its trip (B23):
 * the server only accepts photos once the trip is where the phone shows it,
 * so every action queued before the first step that needs these photos goes
 * first. That step itself waits for the photos, so it never blocks them.
 */
export function photoMustWait(
  queue: readonly QueuedAction[],
  tripId: string,
  stage: EvidenceStage,
): boolean {
  const [first] = forTrip(queue, tripId);
  if (!first) return false;
  return !(first.kind === 'status' && evidenceStageForEvent(first.event) === stage);
}

/** The fields we read from PostgREST and fetch errors. */
interface ErrorFields {
  code?: unknown;
  status?: unknown;
}

/**
 * Whether sending failed for a reason that may go away (no connection, an
 * expired session, a server hiccup) rather than a refusal of the action.
 */
export function isRetryableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true;
  const { code, status } = error as ErrorFields;
  if (typeof status === 'number' && (status === 401 || status === 408 || status >= 500)) {
    return true;
  }
  if (typeof code !== 'string' || code === '') return true;
  // PostgREST auth errors (expired JWT): the session refreshes and we retry.
  if (code.startsWith('PGRST3')) return true;
  // SQLSTATE classes: connection, serialization/deadlock, resources, shutdown.
  return /^(08|40|53|57)/u.test(code);
}

export interface FlushResult {
  /** Ids of the actions the server accepted (or had already recorded). */
  sent: string[];
  /** Actions the server refused, and the later ones of the same trip. */
  rejected: QueuedAction[];
  /** Whether it stopped early to retry later (no connection, etc.). */
  stopped: boolean;
}

/**
 * Sends the queue in order, one action at a time. Stops at the first
 * retryable failure so nothing is sent out of order. When the server refuses
 * an action, the later actions of that trip are dropped with it: they depend
 * on it and would be refused too.
 */
export async function flushQueue(
  queue: readonly QueuedAction[],
  send: (action: QueuedAction) => Promise<void>,
): Promise<FlushResult> {
  const result: FlushResult = { sent: [], rejected: [], stopped: false };
  const refusedTrips = new Set<string>();
  for (const action of queue) {
    if (refusedTrips.has(action.tripId)) {
      result.rejected.push(action);
      continue;
    }
    try {
      await send(action);
      result.sent.push(action.id);
    } catch (error) {
      if (isRetryableError(error)) {
        result.stopped = true;
        return result;
      }
      refusedTrips.add(action.tripId);
      result.rejected.push(action);
    }
  }
  return result;
}
