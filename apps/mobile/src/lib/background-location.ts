import {
  shouldFlush,
  thinPoints,
  toTrackPoint,
  trackingConfigFromEnv,
  trackingCopy,
  type RawFix,
} from '@transport/shared';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useState } from 'react';

import { colors } from '../theme';
import { flushPoints, toRpcPoints } from './location-queue';
import {
  addPoints,
  pointStore,
  purgePoints,
  queueStats,
  readTrackingState,
  writeTrackingState,
} from './location-store';
import { supabase } from './supabase';

// Background GPS of the operator's trip (B22). The OS delivers fixes to a
// task (also with the app closed); the task keeps the useful ones in SQLite
// and sends them in batches. The trip screen decides when tracking runs
// (trackingDecision): only during an active trip, with the consent recorded.
//
// This module must be imported when the JS starts (app/_layout.tsx): the OS
// may launch the app in the background just to run the task.

export const LOCATION_TASK = 'transport.trip-location';

export const trackingConfig = trackingConfigFromEnv({
  intervalS: process.env.EXPO_PUBLIC_TRACKING_INTERVAL_S,
  distanceM: process.env.EXPO_PUBLIC_TRACKING_DISTANCE_M,
});

/** Batches sent per flush: the background task only gets a few seconds. */
const MAX_BATCHES_PER_FLUSH = 10;

const TASK_OPTIONS: Location.LocationTaskOptions = {
  // ~100 m from Wi-Fi and cell towers, GPS only when needed: enough for a
  // truck on the road and much cheaper than "High" (battery).
  accuracy: Location.Accuracy.Balanced,
  // Android: at most one fix per interval. Both: nothing while parked.
  timeInterval: trackingConfig.intervalMs,
  distanceInterval: Math.min(100, trackingConfig.distanceM),
  // Fixes reach JS in batches, so the app wakes up less often.
  deferredUpdatesInterval: trackingConfig.intervalMs,
  // iOS: never pause on its own (long stops at docks), show the blue
  // indicator while tracking, and tune for driving.
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  activityType: Location.ActivityType.AutomotiveNavigation,
  // Android: foreground service with a persistent notification. It keeps
  // running if the app is swiped away; delivering the load stops it.
  foregroundService: {
    notificationTitle: trackingCopy.notificationTitle,
    notificationBody: trackingCopy.notificationBody,
    notificationColor: colors.accent,
    killServiceOnDestroy: false,
  },
};

// Tracking state and queue writes run one after the other, so a stop never
// races a batch of fixes being stored (which would bring the state back).
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(run);
  chain = next.catch(() => undefined);
  return next;
}

const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}

async function isTaskRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

/** Stores the useful fixes. Resolves to the user whose queue may need sending. */
function storeFixes(fixes: readonly RawFix[]): Promise<string | null> {
  return serial(async () => {
    const state = await readTrackingState();
    if (!state) {
      // Nothing should be tracked (privacy safety net): stop the OS updates.
      if (await isTaskRunning()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      return null;
    }
    const points = fixes.flatMap((f) => toTrackPoint(f, trackingConfig) ?? []);
    const kept = thinPoints(state.last, points, trackingConfig);
    const last = kept.at(-1);
    if (last) {
      await addPoints(state.userId, state.tripId, kept, trackingConfig.maxQueuedPoints);
      await writeTrackingState({ ...state, last });
    }
    return state.userId;
  });
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data) return;
    try {
      const userId = await storeFixes(data.locations);
      notify();
      if (userId && shouldFlush(await queueStats(userId), new Date(), trackingConfig)) {
        await flushLocations();
      }
    } catch (taskError) {
      // Never let one failed batch kill the task; the next fix tries again.
      console.warn('[tracking] could not store the location batch', taskError);
    }
  },
);

let flushing: Promise<void> | null = null;

/**
 * Sends the queued points of the signed-in user. Concurrent calls share the
 * run. If the tracked trip no longer accepts points (finished, cancelled,
 * reassigned or no consent), tracking stops.
 */
export function flushLocations(): Promise<void> {
  if (flushing) return flushing;
  const run = (async () => {
    const client = supabase;
    if (!client) return;
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const result = await flushPoints(
      pointStore,
      userId,
      async (tripId, points) => {
        const { error } = await client.rpc('record_trip_locations', {
          p_trip_id: tripId,
          p_points: toRpcPoints(points),
        });
        if (error) throw error;
      },
      { batchSize: trackingConfig.batchSize, maxBatches: MAX_BATCHES_PER_FLUSH },
    );
    const state = await readTrackingState();
    if (state && result.closedTrips.includes(state.tripId)) await stopTripTracking();
  })()
    .catch((error: unknown) => console.warn('[tracking] could not send locations', error))
    .finally(() => {
      if (flushing === run) flushing = null;
      notify();
    });
  flushing = run;
  return run;
}

/** Whether the OS lets the app read the location in the background ("Always"). */
export async function hasTrackingPermission(): Promise<boolean> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return foreground.granted && background.granted;
}

/** Asks for "while in use" and then "always"; only after the consent screen. */
export async function requestTrackingPermission(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.granted;
}

export type StartResult = 'started' | 'needs_permission' | 'unavailable';

/** Starts (or keeps) tracking `tripId` for `userId`. Call it only after trackingDecision says so. */
export async function startTripTracking(userId: string, tripId: string): Promise<StartResult> {
  if (!(await TaskManager.isAvailableAsync())) return 'unavailable';
  if (!(await hasTrackingPermission())) return 'needs_permission';
  return serial(async () => {
    const current = await readTrackingState();
    const same = current?.userId === userId && current.tripId === tripId;
    await writeTrackingState({ userId, tripId, last: same ? current.last : null });
    if (same && (await isTaskRunning())) return 'started';
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, TASK_OPTIONS);
      return 'started';
    } catch (error) {
      await writeTrackingState(null);
      console.warn('[tracking] could not start location updates', error);
      return 'unavailable';
    }
  }).finally(notify);
}

/**
 * Stops tracking. Queued points stay to be sent (they belong to the trip
 * window) unless `purge` is set: sign-out and withdrawn consent delete them.
 */
export async function stopTripTracking({ purge = false } = {}): Promise<void> {
  await serial(async () => {
    await writeTrackingState(null);
    if (await isTaskRunning()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    if (purge) await purgePoints(null);
  }).finally(notify);
}

// Signing out stops tracking and deletes the unsent points of the device; a
// new sign-in deletes the points of any other user. No Supabase calls in the
// callback (they would deadlock on the auth lock).
supabase?.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    void stopTripTracking({ purge: true }).catch(() => undefined);
  } else if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
    void serial(() => purgePoints(session.user.id)).catch(() => undefined);
  }
});

/** Unsent points of `userId` on the phone, refreshed whenever tracking changes. */
export function useQueuedPointCount(userId: string | null): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = () => {
      void queueStats(userId)
        .then((stats) => {
          if (active) setCount(stats.count);
        })
        .catch(() => undefined);
    };
    refresh();
    listeners.add(refresh);
    return () => {
      active = false;
      listeners.delete(refresh);
    };
  }, [userId]);
  return userId ? count : 0;
}
