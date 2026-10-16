import type { TrackPoint } from '@transport/shared';
import * as SQLite from 'expo-sqlite';

import type { PointStore, QueuedPoint } from './location-queue';

// Local SQLite queue of GPS points (B22), readable from the background task.
// It lives in the app sandbox (Android does not back it up: allowBackup is
// off). Points only stay until the server takes them: they are also deleted
// on sign-out, when the consent is withdrawn and when their trip no longer
// accepts them, and the queue is capped (TrackingConfig.maxQueuedPoints).

/** What the background task needs to know about the trip being tracked. */
export interface TrackingState {
  userId: string;
  tripId: string;
  /** Last point kept, to thin the next fixes (thinPoints). */
  last: TrackPoint | null;
}

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  opening ??= SQLite.openDatabaseAsync('tracking.db').then(async (database) => {
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS location_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        trip_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy_m REAL,
        speed_mps REAL,
        heading_deg REAL
      );
      CREATE INDEX IF NOT EXISTS location_points_user_idx ON location_points (user_id, recorded_at);
      CREATE TABLE IF NOT EXISTS tracking_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    return database;
  });
  // A failed open is retried next time instead of failing forever.
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

interface PointRow {
  id: number;
  trip_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
}

const toQueued = (r: PointRow): QueuedPoint => ({
  id: r.id,
  tripId: r.trip_id,
  recordedAt: r.recorded_at,
  lat: r.lat,
  lng: r.lng,
  accuracyM: r.accuracy_m,
  speedMps: r.speed_mps,
  headingDeg: r.heading_deg,
});

/** Queues points and keeps at most `maxPoints` per user (the oldest go first). */
export async function addPoints(
  userId: string,
  tripId: string,
  points: readonly TrackPoint[],
  maxPoints: number,
): Promise<void> {
  if (points.length === 0) return;
  const database = await db();
  await database.withTransactionAsync(async () => {
    for (const p of points) {
      await database.runAsync(
        `INSERT INTO location_points (user_id, trip_id, recorded_at, lat, lng, accuracy_m, speed_mps, heading_deg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, tripId, p.recordedAt, p.lat, p.lng, p.accuracyM, p.speedMps, p.headingDeg],
      );
    }
    await database.runAsync(
      `DELETE FROM location_points WHERE user_id = ? AND id NOT IN (
         SELECT id FROM location_points WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?)`,
      [userId, userId, maxPoints],
    );
  });
}

export async function queueStats(
  userId: string,
): Promise<{ count: number; oldestAt: string | null }> {
  const row = await (
    await db()
  ).getFirstAsync<{ count: number; oldest: string | null }>(
    'SELECT count(*) AS count, min(recorded_at) AS oldest FROM location_points WHERE user_id = ?',
    [userId],
  );
  return { count: row?.count ?? 0, oldestAt: row?.oldest ?? null };
}

export const pointStore: PointStore = {
  async oldestBatch(userId, limit) {
    const database = await db();
    const rows = await database.getAllAsync<PointRow>(
      `SELECT * FROM location_points
       WHERE user_id = ? AND trip_id = (
         SELECT trip_id FROM location_points WHERE user_id = ? ORDER BY recorded_at LIMIT 1)
       ORDER BY recorded_at LIMIT ?`,
      [userId, userId, limit],
    );
    return rows.map(toQueued);
  },
  async remove(ids) {
    if (ids.length === 0) return;
    const database = await db();
    await database.runAsync(
      `DELETE FROM location_points WHERE id IN (${ids.map(() => '?').join(', ')})`,
      [...ids],
    );
  },
  async removeTrip(userId, tripId) {
    await (
      await db()
    ).runAsync('DELETE FROM location_points WHERE user_id = ? AND trip_id = ?', [userId, tripId]);
  },
};

/** Deletes the queued points of every user but `keepUserId` (all if null). */
export async function purgePoints(keepUserId: string | null): Promise<void> {
  const database = await db();
  if (keepUserId) {
    await database.runAsync('DELETE FROM location_points WHERE user_id <> ?', [keepUserId]);
  } else {
    await database.runAsync('DELETE FROM location_points');
  }
}

const STATE_KEY = 'tracking';

export async function readTrackingState(): Promise<TrackingState | null> {
  const row = await (
    await db()
  ).getFirstAsync<{ value: string }>('SELECT value FROM tracking_state WHERE key = ?', [STATE_KEY]);
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as Partial<TrackingState>;
    return typeof value.userId === 'string' && typeof value.tripId === 'string'
      ? { userId: value.userId, tripId: value.tripId, last: value.last ?? null }
      : null;
  } catch {
    return null;
  }
}

export async function writeTrackingState(state: TrackingState | null): Promise<void> {
  const database = await db();
  if (state) {
    await database.runAsync('INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)', [
      STATE_KEY,
      JSON.stringify(state),
    ]);
  } else {
    await database.runAsync('DELETE FROM tracking_state WHERE key = ?', [STATE_KEY]);
  }
}
