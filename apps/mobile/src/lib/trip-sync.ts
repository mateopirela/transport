import NetInfo from '@react-native-community/netinfo';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { AsyncStorageLike } from './chunked-storage';
import { isOffline } from './network';
import { tripQueueStorage } from './secure-store';
import type { Supabase } from './supabase';
import { sendQueuedAction, type OperatorTrip } from './trip-api';
import {
  flushQueue,
  parseStoredQueue,
  pruneSent,
  type QueuedAction,
  type StoredQueue,
} from './trip-queue';

// Runtime of the operator's offline queue (B21): one queue per signed-in user,
// persisted in encrypted storage, sent in order when there is connection.

export interface TripQueueState extends StoredQueue {
  userId: string | null;
  ready: boolean;
  /** Actions the server refused, until the operator dismisses the notice. */
  rejected: readonly QueuedAction[];
  /** Grows every time something reached the server (the screen reloads). */
  syncCount: number;
}

const EMPTY: TripQueueState = {
  userId: null,
  ready: false,
  pending: [],
  sent: [],
  rejected: [],
  syncCount: 0,
};

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
    const stored: StoredQueue = { pending: state.pending, sent: state.sent };
    await storage.setItem(storageKey(userId), JSON.stringify(stored));
  });
  writes = run.catch(() => undefined);
  return run;
}

async function loadQueue(userId: string): Promise<void> {
  if (state.userId === userId) return;
  setState({ ...EMPTY, userId });
  const raw = await storage.getItem(storageKey(userId)).catch(() => null);
  if (state.userId !== userId) return;
  const stored = parseStoredQueue(raw);
  const queuedMeanwhile = state.pending;
  setState({
    ...state,
    ready: true,
    pending: [...stored.pending, ...queuedMeanwhile],
    sent: stored.sent,
  });
  if (queuedMeanwhile.length > 0) await persist(userId).catch(() => undefined);
}

/**
 * Adds an action to the queue of the signed-in user. Resolves to false when it
 * could not be written to the device: it is still sent while the app is open.
 */
export async function enqueueTripAction(action: QueuedAction): Promise<boolean> {
  const { userId } = state;
  if (!userId) throw new Error('no signed-in user for the trip queue');
  setState({ ...state, pending: [...state.pending, action] });
  try {
    await persist(userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * After loading the trip from the server: forgets the sent actions that its
 * timeline already shows (or that belong to another trip).
 */
function confirmLoadedTrip(userId: string, trip: OperatorTrip | null): void {
  if (state.userId !== userId || !state.ready) return;
  const sent = pruneSent(
    state.sent,
    trip
      ? {
          id: trip.id,
          recordedIds: new Set(trip.events.flatMap((e) => e.client_event_id ?? [])),
        }
      : null,
  );
  if (sent.length === state.sent.length) return;
  setState({ ...state, sent });
  void persist(userId).catch(() => undefined);
}

export function dismissRejected(): void {
  setState({ ...state, rejected: [] });
}

/** Thrown to stop sending when the session no longer belongs to the queue's user. */
class QueueOwnerChangedError extends Error {}

async function runFlush(client: Supabase): Promise<void> {
  for (;;) {
    const { userId, pending } = state;
    if (!userId || !state.ready || pending.length === 0) return;
    const result = await flushQueue(pending, async (action) => {
      // Never send one user's actions with another session (or none): the
      // server would refuse them and they would be dropped. The error has no
      // code, so it counts as retryable and the rest waits for the next login.
      const { data } = await client.auth.getSession();
      if (state.userId !== userId || data.session?.user.id !== userId) {
        throw new QueueOwnerChangedError('the session changed');
      }
      await sendQueuedAction(client, action);
    });
    // Signed out meanwhile: the stored queue keeps every unsent action, and the
    // sent ones are idempotent on their id if they go again.
    if (state.userId !== userId) return;
    const sentIds = new Set(result.sent);
    const done = new Set([...sentIds, ...result.rejected.map((a) => a.id)]);
    setState({
      ...state,
      pending: state.pending.filter((a) => !done.has(a.id)),
      // Kept until a loaded trip shows them (confirmLoadedTrip).
      sent: [...state.sent, ...state.pending.filter((a) => sentIds.has(a.id))],
      rejected: [...state.rejected, ...result.rejected],
      syncCount: state.syncCount + (done.size > 0 ? 1 : 0),
    });
    // If this write fails, sent actions may be sent again: the RPCs are
    // idempotent on the action id.
    await persist(userId).catch(() => undefined);
    // Stop on a retryable failure; otherwise send what was queued meanwhile.
    if (result.stopped) return;
  }
}

let flushing: Promise<void> | null = null;

/** Sends the queue in order; concurrent calls share the same run. */
export function flushTripQueue(client: Supabase): Promise<void> {
  if (flushing) return flushing;
  const run = runFlush(client).finally(() => {
    if (flushing === run) flushing = null;
  });
  flushing = run;
  return run;
}

// Last trip loaded from the server, so the operator can keep recording steps
// after reopening the app without connection.
const snapshotKey = (userId: string) => `transport.trip_snapshot.${userId}`;

async function saveTripSnapshot(userId: string, trip: OperatorTrip | null): Promise<boolean> {
  try {
    await storage.setItem(snapshotKey(userId), JSON.stringify(trip));
    return true;
  } catch {
    return false;
  }
}

// Loads may overlap (focus and a finished sync): only the latest one started
// is kept, so an older response never replaces a newer copy.
let lastLoad = 0;
let lastKept = 0;
let keeping: Promise<unknown> = Promise.resolve();

/** Number of a trip load about to start; pass it to keepLoadedTrip. */
export function startTripLoad(): number {
  lastLoad += 1;
  return lastLoad;
}

/**
 * Keeps a trip just loaded from the server: saves it as the offline copy and
 * only then forgets the sent actions it already shows. If the copy cannot be
 * saved, they stay, so an offline restart still shows those steps as done.
 * Resolves to false when a newer load was already kept (discard this one).
 */
export function keepLoadedTrip(
  userId: string,
  trip: OperatorTrip | null,
  load: number,
): Promise<boolean> {
  const run = keeping.then(async () => {
    if (load < lastKept) return false;
    lastKept = load;
    if (await saveTripSnapshot(userId, trip)) confirmLoadedTrip(userId, trip);
    return true;
  });
  keeping = run;
  return run;
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
