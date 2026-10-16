import {
  EVIDENCE_STAGES,
  evidenceStoragePath,
  type EvidenceStage,
  type GatedEvidenceStage,
} from '@transport/shared';
import { z } from 'zod';

import { isRetryableError } from './trip-queue';

// Offline upload queue of the operator's evidence photos (B23). Pure logic,
// no React Native: what a queued photo keeps, how photos are counted against
// the minimums, and how the queue is sent with retries.
//
// A photo is captured once: its file id, hash, time and place are fixed at
// the shutter and never change, so a retry uploads the same bytes to the same
// path, and add_trip_evidence is idempotent on that path.

const photo = z.object({
  /** File id: the uuid of the storage path and of the local file name. */
  id: z.uuid(),
  tripId: z.uuid(),
  stage: z.enum(EVIDENCE_STAGES),
  incidentId: z.uuid().nullable(),
  /**
   * Key of the report of the incident (its client_event_id) when the photo
   * was taken before the report reached the server (F7): the server resolves
   * the incident by it. Absent in queues saved before F7.
   */
  incidentKey: z.uuid().nullable().optional(),
  /** Name of the file in the app's evidence folder (the folder moves between app updates on iOS). */
  fileName: z.string().regex(/^[0-9a-f-]{36}\.jpg$/u),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  capturedAt: z.iso.datetime({ offset: true }),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  /** Failed upload attempts so far, and when the next automatic one is due. */
  attempts: z.number().int().min(0),
  nextAttemptAt: z.iso.datetime({ offset: true }).nullable(),
});

export type QueuedPhoto = z.output<typeof photo>;

/**
 * What the phone keeps: photos still to upload, and photos the server already
 * registered but that the last loaded trip does not show yet (so a reload that
 * fails right after uploading never counts them as missing).
 */
export interface StoredPhotos {
  pending: QueuedPhoto[];
  sent: QueuedPhoto[];
}

export const EMPTY_STORED_PHOTOS: StoredPhotos = { pending: [], sent: [] };

function parsePhotos(value: unknown): QueuedPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = photo.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Reads a stored photo queue; anything unreadable counts as empty. */
export function parseStoredPhotos(raw: string | null): StoredPhotos {
  if (!raw) return EMPTY_STORED_PHOTOS;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY_STORED_PHOTOS;
    const { pending, sent } = value as Record<string, unknown>;
    return { pending: parsePhotos(pending), sent: parsePhotos(sent) };
  } catch {
    return EMPTY_STORED_PHOTOS;
  }
}

/** Path of a queued photo in the `evidence` bucket. */
export function photoStoragePath(item: Pick<QueuedPhoto, 'tripId' | 'stage' | 'id'>): string {
  return evidenceStoragePath({ tripId: item.tripId, stage: item.stage, fileId: item.id });
}

/** Arguments of add_trip_evidence for a queued photo uploaded to `path`. */
export function evidenceRpcArgs(item: QueuedPhoto, path: string) {
  return {
    p_trip_id: item.tripId,
    p_stage: item.stage,
    p_storage_path: path,
    p_sha256: item.sha256,
    p_captured_at: item.capturedAt,
    ...(item.lat === null || item.lng === null
      ? {}
      : { p_latitude: item.lat, p_longitude: item.lng }),
    ...(item.incidentId !== null
      ? { p_incident_id: item.incidentId }
      : item.incidentKey
        ? { p_incident_client_event_id: item.incidentKey }
        : {}),
  };
}

/** A photo the server has, as the trip screen reads it from trip_evidence. */
export interface ServerPhoto {
  stage: EvidenceStage;
  storage_path: string;
  incident_id: string | null;
}

/**
 * Photos of a trip per gated stage, counting the server's and the ones still
 * on the phone (pending, or sent but not shown yet). Each path counts once.
 */
export function photoCounts(
  server: readonly ServerPhoto[],
  stored: StoredPhotos,
  tripId: string,
): Record<GatedEvidenceStage, number> {
  const paths: Record<GatedEvidenceStage, Set<string>> = { pickup: new Set(), delivery: new Set() };
  for (const p of server) if (p.stage !== 'incident') paths[p.stage].add(p.storage_path);
  for (const p of [...stored.sent, ...stored.pending]) {
    if (p.tripId === tripId && p.stage !== 'incident') paths[p.stage].add(photoStoragePath(p));
  }
  return { pickup: paths.pickup.size, delivery: paths.delivery.size };
}

/**
 * Photos of one incident: the server's (by its id) and the ones still on the
 * phone, taken with its id or with the key of its report (F7). Each path
 * counts once. `incidentId` is null while the report is still on the phone.
 */
export function incidentPhotoCount(
  server: readonly ServerPhoto[],
  stored: StoredPhotos,
  incident: { incidentId: string | null; incidentKey: string | null },
): number {
  const { incidentId, incidentKey } = incident;
  const paths = new Set<string>();
  if (incidentId !== null) {
    for (const p of server) if (p.incident_id === incidentId) paths.add(p.storage_path);
  }
  for (const p of [...stored.sent, ...stored.pending]) {
    const byId = incidentId !== null && p.incidentId === incidentId;
    const byKey = incidentKey !== null && p.incidentKey === incidentKey;
    if (byId || byKey) paths.add(photoStoragePath(p));
  }
  return paths.size;
}

/** Whether photos of a stage of a trip are still waiting on the phone. */
export function hasPendingPhotos(
  pending: readonly QueuedPhoto[],
  tripId: string,
  stage: EvidenceStage,
): boolean {
  return pending.some((p) => p.tripId === tripId && p.stage === stage);
}

/**
 * Sent photos still worth keeping after loading `trip` from the server: only
 * the ones of that trip that its evidence does not show yet.
 */
export function pruneSentPhotos(
  sent: readonly QueuedPhoto[],
  trip: { id: string; paths: ReadonlySet<string> } | null,
): QueuedPhoto[] {
  return sent.filter(
    (p) => trip !== null && p.tripId === trip.id && !trip.paths.has(photoStoragePath(p)),
  );
}

const FIRST_RETRY_MS = 15_000;
const MAX_RETRY_MS = 15 * 60_000;

/** Wait before the next automatic attempt after `attempts` failures (exponential, capped). */
export function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(FIRST_RETRY_MS * 2 ** (attempts - 1), MAX_RETRY_MS);
}

/** Photos whose automatic attempt is due at `now` (all of them when forced). */
export function duePhotos(
  pending: readonly QueuedPhoto[],
  now: Date,
  force: boolean,
): QueuedPhoto[] {
  if (force) return [...pending];
  return pending.filter((p) => !p.nextAttemptAt || Date.parse(p.nextAttemptAt) <= now.getTime());
}

/** Earliest automatic attempt still to come, or null when nothing waits. */
export function nextRetryAt(pending: readonly QueuedPhoto[]): string | null {
  let earliest: string | null = null;
  for (const p of pending) {
    if (p.nextAttemptAt && (!earliest || Date.parse(p.nextAttemptAt) < Date.parse(earliest))) {
      earliest = p.nextAttemptAt;
    }
  }
  return earliest;
}

/** The local file of a queued photo is gone (app data cleared): it can never be uploaded. */
export class MissingPhotoFileError extends Error {}

/** The fields we read from Storage errors. */
interface StorageErrorFields {
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

function httpStatus(error: StorageErrorFields): number | null {
  if (typeof error.status === 'number') return error.status;
  if (typeof error.statusCode === 'string' && /^\d{3}$/u.test(error.statusCode)) {
    return Number(error.statusCode);
  }
  return null;
}

/** Whether an upload failed because the file is already in the bucket (an earlier attempt landed). */
export function isDuplicateUpload(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return httpStatus(error as StorageErrorFields) === 409;
}

/**
 * Whether uploading or registering a photo failed for a reason that may go
 * away (no connection, an expired session, a server hiccup, rate limits)
 * rather than a refusal (the trip is no longer the operator's, a bad file).
 */
export function isRetryableUploadError(error: unknown): boolean {
  if (error instanceof MissingPhotoFileError) return false;
  if (typeof error !== 'object' || error === null) return true;
  const fields = error as StorageErrorFields;
  // PostgREST (add_trip_evidence): same rule as the status queue.
  if (typeof fields.code === 'string' && fields.code !== '') return isRetryableError(error);
  const status = httpStatus(fields);
  if (status === null) return true;
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

export interface PhotoFlushResult {
  /** Ids of the photos the server registered (or already had). */
  sent: string[];
  /** Photos the server refused: they will never be accepted. */
  rejected: QueuedPhoto[];
  /** Photos that failed for a passing reason, with their next attempt scheduled. */
  failed: QueuedPhoto[];
  /** Whether it stopped early (a passing failure: likely no connection). */
  stopped: boolean;
}

/**
 * Uploads `photos` one at a time. Photos do not depend on each other, so a
 * refused photo does not stop the rest; a passing failure does (the next ones
 * would fail the same way) and schedules a later attempt for that photo.
 */
export async function flushPhotos(
  photos: readonly QueuedPhoto[],
  upload: (item: QueuedPhoto) => Promise<void>,
  now: () => Date,
): Promise<PhotoFlushResult> {
  const result: PhotoFlushResult = { sent: [], rejected: [], failed: [], stopped: false };
  for (const item of photos) {
    try {
      await upload(item);
      result.sent.push(item.id);
    } catch (error) {
      if (!isRetryableUploadError(error)) {
        result.rejected.push(item);
        continue;
      }
      const attempts = item.attempts + 1;
      result.failed.push({
        ...item,
        attempts,
        nextAttemptAt: new Date(now().getTime() + retryDelayMs(attempts)).toISOString(),
      });
      result.stopped = true;
      return result;
    }
  }
  return result;
}
