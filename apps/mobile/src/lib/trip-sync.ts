import NetInfo from '@react-native-community/netinfo';
import { DEFAULT_EVIDENCE_MINIMUMS, evidenceStageForEvent } from '@transport/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { AsyncStorageLike } from './chunked-storage';
import {
  confirmLoadedPhotos,
  evidenceQueueReady,
  flushEvidenceQueue,
  hasUnsentPhotos,
  onEvidenceProgress,
  setPhotoUploadGate,
} from './evidence-sync';
import { isOffline } from './network';
import { tripQueueStorage } from './secure-store';
import type { Supabase } from './supabase';
import { sendQueuedAction, type OperatorTrip } from './trip-api';
import {
  flushQueue,
  parseStoredQueue,
  photoMustWait,
  pruneSent,
  type QueuedAction,
  type StoredQueue,
} from './trip-queue';

// Runtime of the operator's offline queue (B21): one queue per signed-in user,
// persisted in encrypted storage, sent in order when there is connection.
// It carries status steps, unloading estimates and incident reports (F7).

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

/** Thrown to wait while the photos a step needs are still on the phone (B23). */
class EvidencePendingError extends Error {}

// Actions the current run already sent (state.pending drops them only when the
// run ends), so photos waiting on them can go right away.
const sentThisRun = new Set<string>();

// B23: a photo waits for the actions of its trip queued before the step that
// needs it (the server refuses photos of a trip not yet at that stage), and
// for this queue to be read from the device.
setPhotoUploadGate(
  (item, userId) =>
    state.userId !== userId ||
    !state.ready ||
    photoMustWait(
      state.pending.filter((a) => !sentThisRun.has(a.id)),
      item.tripId,
      item.stage,
    ),
);

async function runFlush(client: Supabase): Promise<void> {
  for (;;) {
    const { userId, pending } = state;
    if (!userId || !state.ready || pending.length === 0) return;
    sentThisRun.clear();
    const result = await flushQueue(pending, async (action) => {
      // Never send one user's actions with another session (or none): the
      // server would refuse them and they would be dropped. The error has no
      // code, so it counts as retryable and the rest waits for the next login.
      const { data } = await client.auth.getSession();
      if (state.userId !== userId || data.session?.user.id !== userId) {
        throw new QueueOwnerChangedError('the session changed');
      }
      // Leaving the pickup and finishing the delivery need their photos on the
      // server first (record_trip_event refuses them otherwise). Codeless, so
      // it counts as retryable: the queue waits and resumes once they upload.
      // The photo queue must be read from the device first: until then it
      // looks empty and the step would be refused for missing evidence.
      const stage = action.kind === 'status' ? evidenceStageForEvent(action.event) : null;
      if (stage) {
        if (!evidenceQueueReady(userId)) {
          throw new EvidencePendingError('the photo queue is not loaded yet');
        }
        await flushEvidenceQueue(client, { force: true });
        if (hasUnsentPhotos(action.tripId, stage)) {
          throw new EvidencePendingError('evidence photos are not uploaded yet');
        }
      }
      await sendQueuedAction(client, action);
      sentThisRun.add(action.id);
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
    sentThisRun.clear();
    // Photos that waited for these steps can go now.
    if (done.size > 0) void flushEvidenceQueue(client, { force: true });
    // If this write fails, sent actions may be sent again: the RPCs are
    // idempotent on the action id.
    await persist(userId).catch(() => undefined);
    // Stop on a retryable failure; otherwise send what was queued meanwhile.
    if (result.stopped) return;
  }
}

let flushing: Promise<void> | null = null;
let runAgain = false;

/**
 * Sends the queue in order; concurrent calls share the same run. A call that
 * arrives during a run (e.g. the photos it waited for just became available)
 * makes it run once more when it ends, so that wakeup is never lost.
 */
export function flushTripQueue(client: Supabase): Promise<void> {
  if (flushing) {
    runAgain = true;
    return flushing;
  }
  const run = (async () => {
    do {
      runAgain = false;
      await runFlush(client);
    } while (runAgain);
  })().finally(() => {
    if (flushing === run) flushing = null;
  });
  flushing = run;
  return run;
}

/**
 * Loads the queue of `userId` from the device (if this JS context has not yet,
 * e.g. the OS started the app in the background) and sends it. Used by the
 * background GPS (B22) before sending locations, so a departure recorded
 * offline reaches the server before the points of that trip.
 */
export async function syncTripQueueFor(client: Supabase, userId: string): Promise<void> {
  await loadQueue(userId);
  await flushTripQueue(client);
}

/**
 * Whether `tripId` may still have status steps of `userId` that did not reach
 * the server. Unknown (queue of another user or not read yet) counts as yes.
 */
export function hasUnsentTripActions(userId: string, tripId: string): boolean {
  if (state.userId !== userId || !state.ready) return true;
  // Incidents (F7) do not change the trip status.
  return state.pending.some((action) => action.tripId === tripId && action.kind !== 'incident');
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
    if (await saveTripSnapshot(userId, trip)) {
      confirmLoadedTrip(userId, trip);
      confirmLoadedPhotos(userId, trip);
    }
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
    const trip = JSON.parse(raw) as OperatorTrip | null;
    // Copies saved before B23 have no evidence: the server checks it anyway.
    return trip
      ? {
          ...trip,
          evidence: trip.evidence ?? [],
          evidenceMinimums: trip.evidenceMinimums ?? DEFAULT_EVIDENCE_MINIMUMS,
        }
      : null;
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
      if (!client) return;
      void flushTripQueue(client);
      // Photos held until this queue was read can go now (B23).
      void flushEvidenceQueue(client, { force: true });
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
    // A step waiting on its photos goes as soon as they upload.
    const photos = onEvidenceProgress(flush);
    return () => {
      net();
      app.remove();
      photos();
    };
  }, [client, userId]);

  const current = useSyncExternalStore(subscribe, () => state);
  return current.userId === userId ? current : EMPTY;
}
