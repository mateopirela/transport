// Background GPS of the operator (B22): when to track, which points to keep
// and when to send them. Pure logic, shared by the app and its tests. Postgres
// enforces the privacy rules again (record_trip_locations: assigned operator,
// active consent, active trip window).
import { haversineKm } from './geo';
import type { TripStatus } from './enums';
import { MAX_LOCATION_BATCH, shouldTrackLocation } from './trips';

/**
 * Version of the consent text (copy/tracking.ts). Changing the text means a
 * new version, and operators are asked to accept it again.
 */
export const LOCATION_CONSENT_VERSION = '2026-10-15';

export interface TrackingConfig {
  /** Keep a point when this much time passed since the last kept one... */
  intervalMs: number;
  /** ...or when the unit moved this far from it. */
  distanceM: number;
  /** Send the queue when its oldest point is this old... */
  flushIntervalMs: number;
  /** ...or when it holds this many points. */
  flushMinPoints: number;
  /** Points per record_trip_locations call. */
  batchSize: number;
  /** Fixes less precise than this are dropped. */
  maxAccuracyM: number;
  /** The device keeps at most this many unsent points (oldest go first). */
  maxQueuedPoints: number;
}

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  intervalMs: 60_000,
  distanceM: 500,
  flushIntervalMs: 5 * 60_000,
  flushMinPoints: 30,
  batchSize: MAX_LOCATION_BATCH,
  maxAccuracyM: 1_000,
  // ~2 weeks at one point per minute: a long trip without any signal.
  maxQueuedPoints: 20_000,
};

const INTERVAL_S_RANGE = [15, 600] as const;
const DISTANCE_M_RANGE = [100, 5_000] as const;

function parseInRange(value: string | undefined, [min, max]: readonly [number, number]) {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * Tracking config with the interval and distance from the environment
 * (EXPO_PUBLIC_TRACKING_INTERVAL_S, EXPO_PUBLIC_TRACKING_DISTANCE_M). Missing
 * or out-of-range values keep the defaults (~60 s or 500 m).
 */
export function trackingConfigFromEnv(source: {
  intervalS?: string | undefined;
  distanceM?: string | undefined;
}): TrackingConfig {
  const intervalS = parseInRange(source.intervalS, INTERVAL_S_RANGE);
  const distanceM = parseInRange(source.distanceM, DISTANCE_M_RANGE);
  return {
    ...DEFAULT_TRACKING_CONFIG,
    ...(intervalS === null ? {} : { intervalMs: intervalS * 1000 }),
    ...(distanceM === null ? {} : { distanceM }),
  };
}

/** A GPS point as record_trip_locations takes it. */
export interface TrackPoint {
  recordedAt: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
}

/** The fields of an expo-location fix that we use. */
export interface RawFix {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
}

const inRange = (value: number | null, min: number, max: number, maxInclusive = true) =>
  value !== null &&
  Number.isFinite(value) &&
  value >= min &&
  (maxInclusive ? value <= max : value < max)
    ? value
    : null;

/**
 * The point to store for a fix, or null when it is unusable (invalid
 * coordinates or time, or too imprecise). Optional fields outside the ranges
 * the database accepts are dropped (iOS reports -1 for "unknown").
 */
export function toTrackPoint(fix: RawFix, config: TrackingConfig): TrackPoint | null {
  const { latitude, longitude, accuracy, speed, heading } = fix.coords;
  if (inRange(latitude, -90, 90) === null || inRange(longitude, -180, 180) === null) return null;
  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= 0) return null;
  const accuracyM = inRange(accuracy, 0, 100_000);
  if (accuracyM !== null && accuracyM > config.maxAccuracyM) return null;
  return {
    recordedAt: new Date(fix.timestamp).toISOString(),
    lat: latitude,
    lng: longitude,
    accuracyM,
    speedMps: inRange(speed, 0, 100),
    headingDeg: inRange(heading, 0, 360, false),
  };
}

/**
 * Points worth keeping, in time order: the first one, then each one ~60 s
 * after the last kept point or ~500 m away from it. Points not after the last
 * kept one (repeated or out of order) are dropped.
 */
export function thinPoints(
  last: TrackPoint | null,
  points: readonly TrackPoint[],
  config: TrackingConfig,
): TrackPoint[] {
  const kept: TrackPoint[] = [];
  let previous = last;
  const sorted = [...points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  for (const point of sorted) {
    if (previous) {
      const elapsed = Date.parse(point.recordedAt) - Date.parse(previous.recordedAt);
      if (elapsed <= 0) continue;
      const movedM = haversineKm(previous, point) * 1000;
      if (elapsed < config.intervalMs && movedM < config.distanceM) continue;
    }
    kept.push(point);
    previous = point;
  }
  return kept;
}

/**
 * Whether to send the queue now. Sending in batches lets the radio sleep
 * between uploads (battery); a point never waits more than flushIntervalMs
 * while there is connection.
 */
export function shouldFlush(
  queue: { count: number; oldestAt: string | null },
  now: Date,
  config: TrackingConfig,
): boolean {
  if (queue.count === 0 || queue.oldestAt === null) return false;
  if (queue.count >= config.flushMinPoints) return true;
  return now.getTime() - Date.parse(queue.oldestAt) >= config.flushIntervalMs;
}

export type TrackingDecision = 'track' | 'stop' | 'needs_consent' | 'needs_permission';

/**
 * What the device should do for the operator's trip. Tracking runs only while
 * the trip is active, with the consent recorded and the "always" permission;
 * otherwise it stops (and delivering the load stops it).
 */
export function trackingDecision(input: {
  status: TripStatus | null;
  consented: boolean;
  backgroundPermission: boolean;
}): TrackingDecision {
  if (input.status === null || !shouldTrackLocation(input.status)) return 'stop';
  if (!input.consented) return 'needs_consent';
  if (!input.backgroundPermission) return 'needs_permission';
  return 'track';
}
