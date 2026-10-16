// Shipper trip tracking (B15): pure rules for the trips list and the live
// map, unit-tested. Postgres enforces the privacy side again: RLS only gives
// the shipper the trip's locations while it is active (trip_locations_select).
import {
  formatDate,
  formatDateTime,
  formatTime,
  isTripActive,
  uuidField,
  type TripStatus,
} from '@transport/shared';

/** Trips that are over: they go to "Historial"; every other one is active. */
export const FINISHED_TRIP_STATUSES = ['closed', 'cancelled'] as const satisfies TripStatus[];

/** Tabs of the trips list, by the `vista` query parameter. */
export type TripsView = 'active' | 'history';

export function parseTripsView(value: string | string[] | undefined): TripsView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'historial' ? 'history' : 'active';
}

/**
 * The operator's phone sends its points in batches (every ~5 minutes, B22),
 * so a gap shorter than this is not a lost signal.
 */
export const NO_SIGNAL_AFTER_MS = 15 * 60_000;

/** How often an active trip's page reloads its data (polling, plan B15). */
export const TRIP_REFRESH_MS = 30_000;

export type MapState =
  | { kind: 'notStarted' }
  | { kind: 'finished' }
  | { kind: 'waiting' }
  | { kind: 'live'; lastAt: string }
  | { kind: 'noSignal'; since: string };

/**
 * What the live map shows. Before departure and after unloading there is no
 * live location; while active, the last point's time tells whether the
 * signal is fresh. Without any point yet, the departure time is the
 * reference ("sin señal desde" once it is too old).
 */
export function mapState(
  trip: { status: TripStatus; started_at: string | null },
  lastLocationAt: string | null,
  now: Date,
): MapState {
  if (!isTripActive(trip.status)) {
    const beforeDeparture = trip.status === 'pending_assignment' || trip.status === 'assigned';
    return beforeDeparture ? { kind: 'notStarted' } : { kind: 'finished' };
  }
  const reference = lastLocationAt ?? trip.started_at;
  if (reference === null) return { kind: 'waiting' };
  const stale = now.getTime() - Date.parse(reference) > NO_SIGNAL_AFTER_MS;
  if (stale) return { kind: 'noSignal', since: reference };
  return lastLocationAt === null ? { kind: 'waiting' } : { kind: 'live', lastAt: lastLocationAt };
}

/**
 * Time of the last signal, as "HH:MM" when it was today in Mexico City and
 * with the date otherwise (a long gap would make a bare time misleading).
 */
export function signalTime(at: string, now: Date): string {
  return formatDate(at) === formatDate(now) ? formatTime(at) : formatDateTime(at);
}

/** Files the shipper may open: evidence photos and trip documents. */
export const TRIP_FILE_BUCKETS = {
  evidencia: {
    bucket: 'evidence',
    // {trip_id}/{stage}/{uuid}.{ext}, as the evidence bucket policy requires.
    path: /^[0-9a-f-]{36}\/(pickup|delivery|incident)\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic)$/u,
  },
  documentos: {
    bucket: 'trip-documents',
    // {trip_id}/{uuid}.{ext}, as the trip-documents bucket policy requires.
    path: /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|webp)$/u,
  },
} as const;

export type TripFileKind = keyof typeof TRIP_FILE_BUCKETS;

/**
 * Bucket and path of a trip file from untrusted query parameters, or null.
 * Only the shape is checked here; the bucket policies decide who reads it.
 */
export function parseTripFile(
  kind: string | null,
  path: string | null,
): { bucket: string; path: string } | null {
  if (kind !== 'evidencia' && kind !== 'documentos') return null;
  const rule = TRIP_FILE_BUCKETS[kind];
  if (!path || !rule.path.test(path)) return null;
  if (!uuidField.safeParse(path.split('/')[0]).success) return null;
  return { bucket: rule.bucket, path };
}
