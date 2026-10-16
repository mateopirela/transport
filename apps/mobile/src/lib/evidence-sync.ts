import NetInfo from '@react-native-community/netinfo';
import type { EvidenceStage } from '@transport/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { AsyncStorageLike } from './chunked-storage';
import { deletePhotoFile, uploadPhoto } from './evidence-api';
import {
  duePhotos,
  flushPhotos,
  hasPendingPhotos,
  nextRetryAt,
  parseStoredPhotos,
  pruneSentPhotos,
  type QueuedPhoto,
  type StoredPhotos,
} from './evidence-queue';
import { isOffline } from './network';
import { tripQueueStorage } from './secure-store';
import type { Supabase } from './supabase';

// Runtime of the operator's evidence upload queue (B23): one queue per
// signed-in user, persisted in encrypted storage (the photos themselves live
// in the app's documents folder), uploaded when there is connection and
// retried with backoff while the app is open.

export interface EvidenceQueueState extends StoredPhotos {
  userId: string | null;
  ready: boolean;
  /** Photos the server refused, until the operator dismisses the notice. */
  rejected: readonly QueuedPhoto[];
  /** Grows every time a photo reached the server (the screen reloads). */
  syncCount: number;
}

const EMPTY: EvidenceQueueState = {
  userId: null,
  ready: false,
  pending: [],
  sent: [],
  rejected: [],
  syncCount: 0,
};

let state: EvidenceQueueState = EMPTY;
const listeners = new Set<() => void>();

function setState(next: EvidenceQueueState) {
  state = next;
  for (const listener of listeners) listener();
}

const storage: AsyncStorageLike = tripQueueStorage;
const storageKey = (userId: string) => `transport.evidence_queue.${userId}`;

// Writes run one after the other and always store the latest queue of the
// user they were scheduled for, so an older snapshot never wins.
let writes: Promise<void> = Promise.resolve();
function persist(userId: string): Promise<void> {
  const run = writes.then(async () => {
    if (state.userId !== userId || !state.ready) return;
    const stored: StoredPhotos = { pending: state.pending, sent: state.sent };
    await storage.setItem(storageKey(userId), JSON.stringify(stored));
  });
  writes = run.catch(() => undefined);
  return run;
}

async function loadPhotos(userId: string): Promise<void> {
  if (state.userId === userId) return;
  setState({ ...EMPTY, userId });
  const raw = await storage.getItem(storageKey(userId)).catch(() => null);
  if (state.userId !== userId) return;
  const stored = parseStoredPhotos(raw);
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
 * Adds a captured photo to the queue of the signed-in user. Resolves to false
 * when the queue could not be written to the device: the photo is still
 * uploaded while the app is open.
 */
export async function enqueuePhoto(item: QueuedPhoto): Promise<boolean> {
  const { userId } = state;
  if (!userId) throw new Error('no signed-in user for the evidence queue');
  setState({ ...state, pending: [...state.pending, item] });
  try {
    await persist(userId);
    return true;
  } catch {
    return false;
  }
}

/** Whether photos of a stage of a trip still wait on the phone (they gate its next step). */
export function hasUnsentPhotos(tripId: string, stage: EvidenceStage): boolean {
  return hasPendingPhotos(state.pending, tripId, stage);
}

/**
 * After loading the trip from the server (and saving its offline copy):
 * forgets the sent photos its evidence already shows, and their local files.
 */
export function confirmLoadedPhotos(
  userId: string,
  trip: { id: string; evidence: readonly { storage_path: string }[] } | null,
): void {
  if (state.userId !== userId || !state.ready) return;
  const sent = pruneSentPhotos(
    state.sent,
    trip ? { id: trip.id, paths: new Set(trip.evidence.map((e) => e.storage_path)) } : null,
  );
  if (sent.length === state.sent.length) return;
  const kept = new Set(sent.map((p) => p.id));
  for (const p of state.sent) if (!kept.has(p.id)) deletePhotoFile(p);
  setState({ ...state, sent });
  void persist(userId).catch(() => undefined);
}

export function dismissRejectedPhotos(): void {
  for (const p of state.rejected) deletePhotoFile(p);
  setState({ ...state, rejected: [] });
}

/** Thrown to stop uploading when the session no longer belongs to the queue's user. */
class QueueOwnerChangedError extends Error {}

// Called after photos reach the server: the status queue may be waiting on them.
const uploadedListeners = new Set<() => void>();

/** Subscribes to "photos reached the server". Returns the unsubscribe function. */
export function onPhotosUploaded(listener: () => void): () => void {
  uploadedListeners.add(listener);
  return () => uploadedListeners.delete(listener);
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryClient: Supabase | null = null;

function scheduleRetry(client: Supabase) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const at = nextRetryAt(state.pending);
  if (!at) return;
  retryClient = client;
  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      if (retryClient) void flushEvidenceQueue(retryClient);
    },
    Math.max(Date.parse(at) - Date.now(), 1000),
  );
}

async function runFlush(client: Supabase, force: boolean): Promise<void> {
  const { userId } = state;
  if (!userId || !state.ready) return;
  const due = duePhotos(state.pending, new Date(), force);
  if (due.length === 0) {
    scheduleRetry(client);
    return;
  }
  const result = await flushPhotos(
    due,
    async (item) => {
      // Never upload one user's photos with another session (or none). The
      // error has no code, so it counts as passing and the rest waits.
      const { data } = await client.auth.getSession();
      if (state.userId !== userId || data.session?.user.id !== userId) {
        throw new QueueOwnerChangedError('the session changed');
      }
      await uploadPhoto(client, item);
    },
    () => new Date(),
  );
  // Signed out meanwhile: the stored queue keeps every photo not registered.
  if (state.userId !== userId) return;
  const sentIds = new Set(result.sent);
  const rejectedIds = new Set(result.rejected.map((p) => p.id));
  const failedById = new Map(result.failed.map((p) => [p.id, p]));
  setState({
    ...state,
    pending: state.pending
      .filter((p) => !sentIds.has(p.id) && !rejectedIds.has(p.id))
      .map((p) => failedById.get(p.id) ?? p),
    // Kept until a loaded trip shows them (confirmLoadedPhotos).
    sent: [...state.sent, ...state.pending.filter((p) => sentIds.has(p.id))],
    rejected: [...state.rejected, ...result.rejected],
    syncCount: state.syncCount + (sentIds.size + rejectedIds.size > 0 ? 1 : 0),
  });
  // If this write fails, sent photos may be uploaded again: harmless, the
  // upload skips an existing file and the RPC is idempotent on the path.
  await persist(userId).catch(() => undefined);
  scheduleRetry(client);
  if (sentIds.size > 0) for (const listener of uploadedListeners) listener();
}

let flushing: Promise<void> | null = null;
let forceAgain = false;

/**
 * Uploads the photos that are due (all of them with `force`: the connection
 * came back, the app returned or the operator asked). Concurrent calls share
 * the same run; a forced call during an unforced run runs again after it.
 */
export function flushEvidenceQueue(client: Supabase, { force = false } = {}): Promise<void> {
  if (flushing) {
    if (force) forceAgain = true;
    return flushing;
  }
  const run = (async () => {
    await runFlush(client, force);
    while (forceAgain) {
      forceAgain = false;
      await runFlush(client, true);
    }
  })().finally(() => {
    if (flushing === run) flushing = null;
  });
  flushing = run;
  return run;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The photo queue of `userId`, loaded from the device and uploaded whenever
 * the connection comes back or the app returns to the foreground.
 */
export function useEvidenceQueue(
  client: Supabase | null,
  userId: string | null,
): EvidenceQueueState {
  useEffect(() => {
    if (!userId) return;
    void loadPhotos(userId).then(() => {
      if (client) void flushEvidenceQueue(client, { force: true });
    });
  }, [client, userId]);

  useEffect(() => {
    if (!client || !userId) return;
    const flush = () => void flushEvidenceQueue(client, { force: true });
    const net = NetInfo.addEventListener((netState) => {
      if (!isOffline(netState)) flush();
    });
    const app = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') flush();
    });
    return () => {
      net();
      app.remove();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };
  }, [client, userId]);

  const current = useSyncExternalStore(subscribe, () => state);
  return current.userId === userId ? current : EMPTY;
}
