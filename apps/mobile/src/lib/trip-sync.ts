import NetInfo from '@react-native-community/netinfo';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { AsyncStorageLike } from './chunked-storage';
import { isOffline } from './network';
import { tripQueueStorage } from './secure-store';
import type { Supabase } from './supabase';
import { sendQueuedAction, type OperatorTrip } from './trip-api';
import { flushQueue, parseQueue, type QueuedAction } from './trip-queue';

// Runtime of the operator's offline queue (B21): one queue per signed-in user,
// persisted in encrypted storage, sent in order when there is connection.

export interface TripQueueState {
  userId: string | null;
  ready: boolean;
  queue: readonly QueuedAction[];
  /** Actions the server refused, until the operator dismisses the notice. */
  rejected: readonly QueuedAction[];
  /** Grows every time something reached the server (the screen reloads). */
  syncCount: number;
}

const EMPTY: TripQueueState = { userId: null, ready: false, queue: [], rejected: [], syncCount: 0 };

let state: TripQueueState = EMPTY;
const listeners = new Set<() => void>();

function setState(next: TripQueueState) {
  state = next;
  for (const listener of listeners) listener();
}

const storage: AsyncStorageLike = tripQueueStorage;
const storageKey = (userId: string) => `transport.trip_queue.${userId}`;

// Writes run one after the other and always store the latest queue of the
// user they were scheduled for, so an older snapshot never wins.
let writes: Promise<void> = Promise.resolve();
function persist(userId: string): Promise<void> {
  const run = writes.then(async () => {
    // Before the stored queue is read, writing would overwrite it.
    if (state.userId !== userId || !state.ready) return;
    await storage.setItem(storageKey(userId), JSON.stringify(state.queue));
  });
  writes = run.catch(() => undefined);
  return run;
}

async function loadQueue(userId: string): Promise<void> {
  if (state.userId === userId) return;
  setState({ ...EMPTY, userId });
  const raw = await storage.getItem(storageKey(userId)).catch(() => null);
  if (state.userId !== userId) return;
  const queuedMeanwhile = state.queue;
  setState({ ...state, ready: true, queue: [...parseQueue(raw), ...queuedMeanwhile] });
  if (queuedMeanwhile.length > 0) await persist(userId).catch(() => undefined);
}

/**
 * Adds an action to the queue of the signed-in user. Resolves to false when it
 * could not be written to the device: it is still sent while the app is open.
 */
export async function enqueueTripAction(action: QueuedAction): Promise<boolean> {
  const { userId } = state;
  if (!userId) throw new Error('no signed-in user for the trip queue');
  setState({ ...state, queue: [...state.queue, action] });
  try {
    await persist(userId);
    return true;
  } catch {
    return false;
  }
}

export function dismissRejected(): void {
  setState({ ...state, rejected: [] });
}

let flushing: Promise<void> | null = null;

/** Sends the queue in order; concurrent calls share the same run. */
export function flushTripQueue(client: Supabase): Promise<void> {
  flushing ??= (async () => {
    try {
      for (;;) {
        const { userId, queue } = state;
        if (!userId || !state.ready || queue.length === 0) return;
        const result = await flushQueue(queue, (action) => sendQueuedAction(client, action));
        if (state.userId !== userId) return;
        const done = new Set([...result.sent, ...result.rejected.map((a) => a.id)]);
        setState({
          ...state,
          queue: state.queue.filter((a) => !done.has(a.id)),
          rejected: [...state.rejected, ...result.rejected],
          syncCount: state.syncCount + (done.size > 0 ? 1 : 0),
        });
        // If this write fails, sent actions may be sent again: the RPCs are
        // idempotent on the action id.
        await persist(userId).catch(() => undefined);
        // Stop on a retryable failure; otherwise send what was queued meanwhile.
        if (result.stopped) return;
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

// Last trip loaded from the server, so the operator can keep recording steps
// after reopening the app without connection.
const snapshotKey = (userId: string) => `transport.trip_snapshot.${userId}`;

export async function saveTripSnapshot(userId: string, trip: OperatorTrip | null): Promise<void> {
  await storage.setItem(snapshotKey(userId), JSON.stringify(trip)).catch(() => undefined);
}

/** The saved trip (null: no trip), or undefined when nothing was saved. */
export async function readTripSnapshot(userId: string): Promise<OperatorTrip | null | undefined> {
  const raw = await storage.getItem(snapshotKey(userId)).catch(() => null);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as OperatorTrip | null;
  } catch {
    return undefined;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The queue of `userId`, loaded from the device and sent whenever the
 * connection comes back or the app returns to the foreground.
 */
export function useTripQueue(client: Supabase | null, userId: string | null): TripQueueState {
  useEffect(() => {
    if (!userId) return;
    void loadQueue(userId).then(() => {
      if (client) void flushTripQueue(client);
    });
  }, [client, userId]);

  useEffect(() => {
    if (!client || !userId) return;
    const flush = () => void flushTripQueue(client);
    const net = NetInfo.addEventListener((netState) => {
      if (!isOffline(netState)) flush();
    });
    const app = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') flush();
    });
    return () => {
      net();
      app.remove();
    };
  }, [client, userId]);

  const current = useSyncExternalStore(subscribe, () => state);
  return current.userId === userId ? current : EMPTY;
}
