import {
  documentFileIssue,
  documentStoragePath,
  endOfDayInMexicoCity,
  type DocumentFileIssue,
  type DocumentOwnerType,
} from '@transport/shared';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File as LocalFile } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { photoResize } from './fleet-forms';
import type { Supabase } from './supabase';

// Picking, compressing and uploading a document from the phone (B18). Photos
// are resized and re-encoded as JPEG (this also turns HEIC into JPEG); PDFs
// are uploaded as they are. The bucket and submit_document check the file
// again on the server.

export interface PickedFile {
  uri: string;
  mimeType: string;
  name: string | null;
  size: number;
}

export type PickSource = 'camera' | 'library' | 'pdf';

export type PickOutcome =
  | { status: 'picked'; file: PickedFile }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'invalid'; issue: DocumentFileIssue };

const PHOTO_QUALITY = 0.7;

/** Resizes and re-encodes a photo as JPEG in the cache (also used for trip evidence, B23). */
export async function compressPhoto(asset: ImagePicker.ImagePickerAsset): Promise<PickedFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  const resize = photoResize(asset.width, asset.height);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return {
    uri: result.uri,
    mimeType: 'image/jpeg',
    name: asset.fileName ?? null,
    size: new LocalFile(result.uri).size,
  };
}

async function pickPhoto(source: 'camera' | 'library'): Promise<PickOutcome> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  return checked(await compressPhoto(asset));
}

async function pickPdf(): Promise<PickOutcome> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  return checked({
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'application/pdf',
    name: asset.name,
    size: asset.size ?? new LocalFile(asset.uri).size,
  });
}

function checked(file: PickedFile): PickOutcome {
  const issue = documentFileIssue({ size: file.size, type: file.mimeType });
  return issue ? { status: 'invalid', issue } : { status: 'picked', file };
}

export function pickDocument(source: PickSource): Promise<PickOutcome> {
  return source === 'pdf' ? pickPdf() : pickPhoto(source);
}

/**
 * Uploads the file under `{company}/{owner_type}/{owner}/{uuid}.{ext}` and
 * registers it with submit_document. `expiresOn` is a calendar day; the
 * document stays valid until the end of that day in Mexico City.
 */
export async function uploadDocument(
  client: Supabase,
  input: {
    companyId: string;
    ownerType: DocumentOwnerType;
    ownerId: string;
    requirementId: string;
    file: PickedFile;
    expiresOn: string | undefined;
  },
): Promise<void> {
  const { companyId, ownerType, ownerId, requirementId, file, expiresOn } = input;
  const path = documentStoragePath({
    companyId,
    ownerType,
    ownerId,
    fileId: randomUUID(),
    mimeType: file.mimeType,
  });
  const bytes = await new LocalFile(file.uri).arrayBuffer();
  const upload = await client.storage
    .from('documents')
    .upload(path, bytes, { contentType: file.mimeType, upsert: false });
  if (upload.error) throw upload.error;

  const { error } = await client.rpc('submit_document', {
    p_requirement_id: requirementId,
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_storage_path: path,
    ...(file.name ? { p_file_name: file.name } : {}),
    ...(expiresOn ? { p_expires_at: endOfDayInMexicoCity(expiresOn) } : {}),
  });
  if (error) throw error;
}
