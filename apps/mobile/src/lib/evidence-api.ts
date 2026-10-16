import { toHex, type EvidenceStage } from '@transport/shared';
import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import { Directory, File as LocalFile, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { compressPhoto } from './document-upload';
import {
  isDuplicateUpload,
  MissingPhotoFileError,
  photoStoragePath,
  type QueuedPhoto,
} from './evidence-queue';
import { currentPosition } from './location';
import type { Supabase } from './supabase';

// Capturing and uploading the operator's evidence photos (B23). Photos come
// only from the camera (never the gallery, so no old photo passes as today's),
// are compressed once, hashed and kept in the app's documents folder until
// the server registers them.

function evidenceFolder(): Directory {
  const folder = new Directory(Paths.document, 'evidence');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}

function photoFile(fileName: string): LocalFile {
  return new LocalFile(evidenceFolder(), fileName);
}

/** Local URI of a queued photo (thumbnails), or null when its file is gone. */
export function photoUri(item: Pick<QueuedPhoto, 'fileName'>): string | null {
  try {
    const file = photoFile(item.fileName);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Deletes the local file of a photo that no longer needs it. Never throws. */
export function deletePhotoFile(item: Pick<QueuedPhoto, 'fileName'>): void {
  try {
    const file = photoFile(item.fileName);
    if (file.exists) file.delete();
  } catch {
    // A leftover file only takes space; the next capture does not depend on it.
  }
}

export type CaptureOutcome =
  | { status: 'captured'; photo: QueuedPhoto }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'failed' };

/**
 * Takes a photo with the camera for a stage of a trip. The time is the
 * moment the shutter returned; the place is the current fix when there is one
 * (GPS works offline). The hash covers the exact bytes that will be uploaded.
 */
export async function capturePhoto(input: {
  tripId: string;
  stage: EvidenceStage;
  incidentId: string | null;
}): Promise<CaptureOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  const capturedAt = new Date().toISOString();

  try {
    // Location is optional for a photo: never blocks the evidence.
    const [compressed, located] = await Promise.all([
      compressPhoto(asset),
      currentPosition({ ask: false }),
    ]);
    const id = randomUUID().toLowerCase();
    const fileName = `${id}.jpg`;
    const target = photoFile(fileName);
    new LocalFile(compressed.uri).moveSync(target);
    const bytes = await target.bytes();
    const sha256 = toHex(await digest(CryptoDigestAlgorithm.SHA256, bytes));
    return {
      status: 'captured',
      photo: {
        id,
        tripId: input.tripId,
        stage: input.stage,
        incidentId: input.incidentId,
        fileName,
        sha256,
        capturedAt,
        lat: located.ok ? located.position.lat : null,
        lng: located.ok ? located.position.lng : null,
        attempts: 0,
        nextAttemptAt: null,
      },
    };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * Uploads a queued photo to `{trip}/{stage}/{id}.jpg` and registers it with
 * add_trip_evidence. Safe to repeat: a file that an earlier attempt already
 * uploaded is not uploaded again, and the RPC is idempotent on the path.
 */
export async function uploadPhoto(client: Supabase, item: QueuedPhoto): Promise<void> {
  const file = photoFile(item.fileName);
  if (!file.exists) throw new MissingPhotoFileError('the photo file is gone');
  const path = photoStoragePath(item);
  const bytes = await file.bytes();
  const upload = await client.storage
    .from('evidence')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (upload.error && !isDuplicateUpload(upload.error)) throw upload.error;

  const { error } = await client.rpc('add_trip_evidence', {
    p_trip_id: item.tripId,
    p_stage: item.stage,
    p_storage_path: path,
    p_sha256: item.sha256,
    p_captured_at: item.capturedAt,
    ...(item.lat === null || item.lng === null
      ? {}
      : { p_latitude: item.lat, p_longitude: item.lng }),
    ...(item.incidentId === null ? {} : { p_incident_id: item.incidentId }),
  });
  if (error) throw error;
}
