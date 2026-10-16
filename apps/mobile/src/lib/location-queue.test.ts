import { describe, expect, it } from 'vitest';

import { flushPoints, toRpcPoints, type PointStore, type QueuedPoint } from './location-queue';

const USER = 'user-1';
const TRIP_A = '00000000-0000-4000-8000-00000000000a';
const TRIP_B = '00000000-0000-4000-8000-00000000000b';

function point(id: number, tripId = TRIP_A, userId = USER): QueuedPoint & { userId: string } {
  return {
    id,
    userId,
    tripId,
    recordedAt: new Date(Date.UTC(2026, 9, 15, 12, id)).toISOString(),
    lat: 25.7,
    lng: -100.3,
    accuracyM: id % 2 === 0 ? 10 : null,
    speedMps: null,
    headingDeg: null,
  };
}

/** In-memory version of the SQLite store (same contract). */
function memoryStore(initial: ReturnType<typeof point>[]) {
  let rows = [...initial];
  const store: PointStore = {
    oldestBatch(userId, limit) {
      const own = rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
      const first = own[0];
      return Promise.resolve(
        first ? own.filter((r) => r.tripId === first.tripId).slice(0, limit) : [],
      );
    },
    remove(ids) {
      rows = rows.filter((r) => !ids.includes(r.id));
      return Promise.resolve();
    },
    removeTrip(userId, tripId) {
      rows = rows.filter((r) => r.userId !== userId || r.tripId !== tripId);
      return Promise.resolve();
    },
  };
  return { store, ids: () => rows.map((r) => r.id) };
}

const options = { batchSize: 2, maxBatches: 10 };

describe('flushPoints', () => {
  it('sends the queue oldest first, in batches per trip', async () => {
    const { store, ids } = memoryStore([point(1), point(2), point(3, TRIP_B), point(4), point(5)]);
    const calls: [string, number[]][] = [];
    const result = await flushPoints(
      store,
      USER,
      (tripId, points) => {
        calls.push([tripId, points.map((p) => p.id)]);
        return Promise.resolve();
      },
      options,
    );
    expect(calls).toEqual([
      [TRIP_A, [1, 2]],
      [TRIP_B, [3]],
      [TRIP_A, [4, 5]],
    ]);
    expect(result).toEqual({ sent: 5, dropped: 0, closedTrips: [], stopped: false });
    expect(ids()).toEqual([]);
  });

  it('never sends the points of another user', async () => {
    const { store, ids } = memoryStore([point(1, TRIP_A, 'someone-else'), point(2)]);
    const sent: number[] = [];
    await flushPoints(
      store,
      USER,
      (_trip, points) => {
        sent.push(...points.map((p) => p.id));
        return Promise.resolve();
      },
      options,
    );
    expect(sent).toEqual([2]);
    expect(ids()).toEqual([1]);
  });

  it('keeps everything and stops on a retryable failure', async () => {
    const { store, ids } = memoryStore([point(1), point(2), point(3)]);
    let call = 0;
    const result = await flushPoints(
      store,
      USER,
      () => {
        call += 1;
        return call === 1
          ? Promise.resolve()
          : Promise.reject(new TypeError('Network request failed'));
      },
      options,
    );
    expect(result).toMatchObject({ sent: 2, stopped: true });
    expect(ids()).toEqual([3]);
  });

  it('keeps the points over the rate limit of record_trip_locations (F12)', async () => {
    const { store, ids } = memoryStore([point(1), point(2), point(3)]);
    const result = await flushPoints(
      store,
      USER,
      () => Promise.reject({ code: 'PT429', message: 'rate limit exceeded' }),
      options,
    );
    expect(result).toMatchObject({ sent: 0, dropped: 0, stopped: true });
    expect(ids()).toEqual([1, 2, 3]);
  });

  it('deletes the points of a trip that no longer takes them', async () => {
    for (const code of ['55000', '42501']) {
      const { store, ids } = memoryStore([point(1), point(2), point(3), point(4, TRIP_B)]);
      const result = await flushPoints(
        store,
        USER,
        (tripId) => (tripId === TRIP_A ? Promise.reject({ code }) : Promise.resolve()),
        options,
      );
      expect(result).toEqual({ sent: 1, dropped: 2, closedTrips: [TRIP_A], stopped: false });
      expect(ids()).toEqual([]);
    }
  });

  it('keeps the points of a trip whose departure is still queued', async () => {
    const { store, ids } = memoryStore([point(1), point(2), point(3, TRIP_B)]);
    const result = await flushPoints(
      store,
      USER,
      (tripId) => (tripId === TRIP_A ? Promise.reject({ code: '55000' }) : Promise.resolve()),
      { ...options, hasUnsentTripActions: (tripId) => tripId === TRIP_A },
    );
    expect(result).toEqual({ sent: 0, dropped: 0, closedTrips: [], stopped: true });
    expect(ids()).toEqual([1, 2, 3]);
  });

  it('still deletes a trip without consent or assignment despite queued steps', async () => {
    const { store, ids } = memoryStore([point(1), point(2)]);
    const result = await flushPoints(store, USER, () => Promise.reject({ code: '42501' }), {
      ...options,
      hasUnsentTripActions: () => true,
    });
    expect(result).toEqual({ sent: 0, dropped: 2, closedTrips: [TRIP_A], stopped: false });
    expect(ids()).toEqual([]);
  });

  it('drops only the refused batch for invalid points', async () => {
    const { store, ids } = memoryStore([point(1), point(2), point(3)]);
    let call = 0;
    const result = await flushPoints(
      store,
      USER,
      () => {
        call += 1;
        return call === 1 ? Promise.reject({ code: '22023' }) : Promise.resolve();
      },
      options,
    );
    expect(result).toEqual({ sent: 1, dropped: 2, closedTrips: [], stopped: false });
    expect(ids()).toEqual([]);
  });

  it('sends at most maxBatches per run', async () => {
    const { store, ids } = memoryStore([point(1), point(2), point(3), point(4), point(5)]);
    const result = await flushPoints(store, USER, () => Promise.resolve(), {
      batchSize: 2,
      maxBatches: 2,
    });
    expect(result.sent).toBe(4);
    expect(ids()).toEqual([5]);
  });
});

describe('toRpcPoints', () => {
  it('sends the RPC fields and leaves out unknown values', () => {
    expect(toRpcPoints([point(2), point(1)])).toEqual([
      { recordedAt: point(2).recordedAt, lat: 25.7, lng: -100.3, accuracyM: 10 },
      { recordedAt: point(1).recordedAt, lat: 25.7, lng: -100.3 },
    ]);
  });
});
