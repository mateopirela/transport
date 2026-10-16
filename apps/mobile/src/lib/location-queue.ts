import type { TrackPoint } from '@transport/shared';

import { isRetryableError } from './trip-queue';

// Sending the queued GPS points (B22). Pure logic over a store interface: the
// app uses SQLite (location-store.ts), the tests an in-memory store.

export interface QueuedPoint extends TrackPoint {
  /** Row id in the local queue. */
  id: number;
  tripId: string;
}

export interface PointStore {
  /** Oldest points of the user's oldest queued trip, in time order. */
  oldestBatch(userId: string, limit: number): Promise<QueuedPoint[]>;
  remove(ids: readonly number[]): Promise<void>;
  removeTrip(userId: string, tripId: string): Promise<void>;
}

export interface PointFlushResult {
  sent: number;
  dropped: number;
  /** Trips whose points the server no longer takes (not active, reassigned, no consent). */
  closedTrips: string[];
  /** Stopped early to retry later (no connection, expired session...). */
  stopped: boolean;
}

/** The fields we read from PostgREST errors. */
interface ErrorFields {
  code?: unknown;
}

/**
 * Sends the user's queue oldest first, one batch per call, up to `maxBatches`
 * (a background task has a few seconds). Duplicates are harmless: the RPC
 * ignores points it already has (trip_id, recorded_at).
 *
 * - Retryable failure: stop; everything stays queued.
 * - Trip not accepting points (55000 not active, 42501 not assigned or no
 *   consent): that trip's points are deleted from the phone. They would never
 *   be accepted, and keeping location data we cannot use is a privacy cost.
 * - "Not active" (55000) while `hasUnsentTripActions(tripId)` says the
 *   trip still has queued status steps (a departure recorded offline): stop
 *   and keep everything; the points are accepted once the step is sent.
 * - Any other refusal (invalid points): that batch is dropped.
 */
export async function flushPoints(
  store: PointStore,
  userId: string,
  send: (tripId: string, points: QueuedPoint[]) => Promise<void>,
  {
    batchSize,
    maxBatches,
    hasUnsentTripActions = () => false,
  }: {
    batchSize: number;
    maxBatches: number;
    hasUnsentTripActions?: (tripId: string) => boolean;
  },
): Promise<PointFlushResult> {
  const result: PointFlushResult = { sent: 0, dropped: 0, closedTrips: [], stopped: false };
  for (let i = 0; i < maxBatches; i += 1) {
    const batch = await store.oldestBatch(userId, batchSize);
    const first = batch[0];
    if (!first) return result;
    try {
      await send(first.tripId, batch);
      await store.remove(batch.map((p) => p.id));
      result.sent += batch.length;
    } catch (error) {
      if (isRetryableError(error)) {
        result.stopped = true;
        return result;
      }
      const { code } = error as ErrorFields;
      if (code === '55000' && hasUnsentTripActions(first.tripId)) {
        result.stopped = true;
        return result;
      }
      if (code === '55000' || code === '42501') {
        await store.removeTrip(userId, first.tripId);
        result.closedTrips.push(first.tripId);
      } else {
        await store.remove(batch.map((p) => p.id));
      }
      result.dropped += batch.length;
    }
  }
  return result;
}

/** Points as the record_trip_locations RPC takes them. */
export function toRpcPoints(points: readonly QueuedPoint[]) {
  return points.map((p) => ({
    recordedAt: p.recordedAt,
    lat: p.lat,
    lng: p.lng,
    ...(p.accuracyM === null ? {} : { accuracyM: p.accuracyM }),
    ...(p.speedMps === null ? {} : { speedMps: p.speedMps }),
    ...(p.headingDeg === null ? {} : { headingDeg: p.headingDeg }),
  }));
}
