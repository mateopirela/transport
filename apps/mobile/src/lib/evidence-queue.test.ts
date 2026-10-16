import { describe, expect, it } from 'vitest';

import {
  duePhotos,
  evidenceRpcArgs,
  flushPhotos,
  hasPendingPhotos,
  incidentPhotoCount,
  isDuplicateUpload,
  isRetryableUploadError,
  MissingPhotoFileError,
  nextRetryAt,
  parseStoredPhotos,
  photoCounts,
  photoStoragePath,
  pruneSentPhotos,
  retryDelayMs,
  type QueuedPhoto,
} from './evidence-queue';

const TRIP = '7f1c2a8e-4b6d-4c3e-9a1f-2d5e6f708192';
const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const INCIDENT = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`;

function photo(stage: QueuedPhoto['stage'], overrides: Partial<QueuedPhoto> = {}): QueuedPhoto {
  const id = uuid();
  return {
    id,
    tripId: TRIP,
    stage,
    incidentId: stage === 'incident' ? INCIDENT : null,
    fileName: `${id}.jpg`,
    sha256: 'ab'.repeat(32),
    capturedAt: '2026-10-15T10:00:00-06:00',
    lat: 25.6866,
    lng: -100.3161,
    attempts: 0,
    nextAttemptAt: null,
    ...overrides,
  };
}

const NOW = new Date('2026-10-15T16:00:00Z');

describe('stored photo queue', () => {
  it('round-trips pending and sent photos and drops corrupt entries', () => {
    const pending = [photo('pickup'), photo('incident', { lat: null, lng: null })];
    const sent = [photo('delivery')];
    expect(parseStoredPhotos(JSON.stringify({ pending, sent }))).toEqual({ pending, sent });
    expect(
      parseStoredPhotos(
        JSON.stringify({ pending: [{ id: 'x' }, { ...pending[0], sha256: 'nope' }, pending[1]] }),
      ),
    ).toEqual({ pending: [pending[1]], sent: [] });
  });

  it('treats anything unreadable as empty', () => {
    for (const raw of [null, '', '{', 'null', '42', '[]']) {
      expect(parseStoredPhotos(raw)).toEqual({ pending: [], sent: [] });
    }
  });

  it('keeps only file names in the app folder, never absolute paths', () => {
    const item = photo('pickup');
    expect(
      parseStoredPhotos(
        JSON.stringify({ pending: [{ ...item, fileName: `../../${item.fileName}` }] }),
      ).pending,
    ).toEqual([]);
  });
});

describe('photo counts against the minimums', () => {
  it('counts server photos and the ones on the phone once per path', () => {
    const uploaded = photo('pickup');
    const waiting = photo('pickup');
    const counts = photoCounts(
      [
        { stage: 'pickup', storage_path: photoStoragePath(uploaded), incident_id: null },
        { stage: 'delivery', storage_path: `${TRIP}/delivery/x.jpg`, incident_id: null },
        { stage: 'incident', storage_path: `${TRIP}/incident/y.jpg`, incident_id: INCIDENT },
      ],
      {
        pending: [waiting, photo('incident'), photo('delivery', { tripId: OTHER })],
        sent: [uploaded],
      },
      TRIP,
    );
    expect(counts).toEqual({ pickup: 2, delivery: 1 });
  });

  it('knows when a stage of a trip still waits on the phone', () => {
    const pending = [photo('pickup'), photo('delivery', { tripId: OTHER })];
    expect(hasPendingPhotos(pending, TRIP, 'pickup')).toBe(true);
    expect(hasPendingPhotos(pending, TRIP, 'delivery')).toBe(false);
    expect(hasPendingPhotos(pending, OTHER, 'delivery')).toBe(true);
  });

  it('forgets sent photos once the loaded trip shows them, or when it is another trip', () => {
    const shown = photo('pickup');
    const notYet = photo('delivery');
    const other = photo('pickup', { tripId: OTHER });
    const sent = [shown, notYet, other];
    expect(pruneSentPhotos(sent, { id: TRIP, paths: new Set([photoStoragePath(shown)]) })).toEqual([
      notYet,
    ]);
    expect(pruneSentPhotos(sent, null)).toEqual([]);
  });

  it('uses the bucket path of the photo', () => {
    const item = photo('delivery');
    expect(photoStoragePath(item)).toBe(`${TRIP}/delivery/${item.id}.jpg`);
  });
});

describe('retries', () => {
  it('backs off exponentially up to 15 minutes', () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBe(15_000);
    expect(retryDelayMs(2)).toBe(30_000);
    expect(retryDelayMs(3)).toBe(60_000);
    expect(retryDelayMs(20)).toBe(15 * 60_000);
  });

  it('picks the photos that are due, or all of them when forced', () => {
    const fresh = photo('pickup');
    const due = photo('pickup', { attempts: 1, nextAttemptAt: '2026-10-15T15:59:00Z' });
    const later = photo('pickup', { attempts: 2, nextAttemptAt: '2026-10-15T16:05:00Z' });
    expect(duePhotos([fresh, due, later], NOW, false)).toEqual([fresh, due]);
    expect(duePhotos([fresh, due, later], NOW, true)).toEqual([fresh, due, later]);
    expect(nextRetryAt([fresh, later, due])).toBe('2026-10-15T15:59:00Z');
    expect(nextRetryAt([fresh])).toBeNull();
  });

  it('retries connection, session, rate-limit and server failures, but not refusals', () => {
    expect(isRetryableUploadError(new TypeError('Network request failed'))).toBe(true);
    expect(isRetryableUploadError({ status: 401, statusCode: '401' })).toBe(true);
    expect(isRetryableUploadError({ status: 429 })).toBe(true);
    expect(isRetryableUploadError({ statusCode: '503' })).toBe(true);
    expect(isRetryableUploadError({ code: '08006', message: 'connection failure' })).toBe(true);
    // add_trip_evidence over its rate limit (F12).
    expect(isRetryableUploadError({ code: 'PT429', message: 'rate limit exceeded' })).toBe(true);
    // Bucket policy (trip no longer the operator's), file too large, bad type.
    expect(isRetryableUploadError({ status: 403, statusCode: '403' })).toBe(false);
    expect(isRetryableUploadError({ statusCode: '413' })).toBe(false);
    // add_trip_evidence refusals.
    expect(isRetryableUploadError({ code: '42501' })).toBe(false);
    expect(isRetryableUploadError({ code: '55000' })).toBe(false);
    expect(isRetryableUploadError(new MissingPhotoFileError('gone'))).toBe(false);
  });

  it('recognizes a file that an earlier attempt already uploaded', () => {
    expect(isDuplicateUpload({ statusCode: '409', message: 'The resource already exists' })).toBe(
      true,
    );
    expect(isDuplicateUpload({ status: 409 })).toBe(true);
    expect(isDuplicateUpload({ status: 403 })).toBe(false);
    expect(isDuplicateUpload(null)).toBe(false);
  });
});

describe('flushPhotos', () => {
  it('uploads in order and reports what reached the server', async () => {
    const photos = [photo('pickup'), photo('pickup')];
    const uploaded: string[] = [];
    const result = await flushPhotos(
      photos,
      async (item) => {
        uploaded.push(item.id);
      },
      () => NOW,
    );
    expect(uploaded).toEqual(photos.map((p) => p.id));
    expect(result).toEqual({
      sent: photos.map((p) => p.id),
      rejected: [],
      failed: [],
      stopped: false,
    });
  });

  it('drops a refused photo and keeps uploading the rest', async () => {
    const [refused, ok] = [photo('pickup'), photo('delivery')];
    const result = await flushPhotos(
      [refused, ok],
      async (item) => {
        if (item.id === refused.id) throw { code: '55000' };
      },
      () => NOW,
    );
    expect(result.sent).toEqual([ok.id]);
    expect(result.rejected).toEqual([refused]);
    expect(result.stopped).toBe(false);
  });

  it('stops at a passing failure and schedules the next attempt of that photo', async () => {
    const [first, second] = [photo('pickup', { attempts: 1 }), photo('pickup')];
    const tried: string[] = [];
    const result = await flushPhotos(
      [first, second],
      async (item) => {
        tried.push(item.id);
        throw new TypeError('Network request failed');
      },
      () => NOW,
    );
    expect(tried).toEqual([first.id]);
    expect(result.stopped).toBe(true);
    expect(result.sent).toEqual([]);
    expect(result.failed).toEqual([
      { ...first, attempts: 2, nextAttemptAt: new Date(NOW.getTime() + 30_000).toISOString() },
    ]);
  });
});

describe('photos of an incident reported offline (F7)', () => {
  const KEY = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

  it('keeps the key of the report and still reads queues saved before it', () => {
    const byKey = photo('incident', { incidentId: null, incidentKey: KEY });
    const older = photo('incident');
    expect(parseStoredPhotos(JSON.stringify({ pending: [byKey, older], sent: [] }))).toEqual({
      pending: [byKey, older],
      sent: [],
    });
    expect(
      parseStoredPhotos(JSON.stringify({ pending: [{ ...byKey, incidentKey: 'nope' }] })).pending,
    ).toEqual([]);
  });

  it('names the incident by the key of its report while it has no id', () => {
    const byKey = photo('incident', { incidentId: null, incidentKey: KEY, lat: null, lng: null });
    const path = photoStoragePath(byKey);
    expect(evidenceRpcArgs(byKey, path)).toEqual({
      p_trip_id: TRIP,
      p_stage: 'incident',
      p_storage_path: path,
      p_sha256: byKey.sha256,
      p_captured_at: byKey.capturedAt,
      p_incident_client_event_id: KEY,
    });
    // With its id (taken after the report loaded), the id goes, as before.
    const byId = photo('incident', { incidentKey: null });
    expect(evidenceRpcArgs(byId, photoStoragePath(byId))).toMatchObject({
      p_incident_id: INCIDENT,
      p_latitude: 25.6866,
      p_longitude: -100.3161,
    });
    expect(evidenceRpcArgs(byId, photoStoragePath(byId))).not.toHaveProperty(
      'p_incident_client_event_id',
    );
    // Pickup and delivery photos name no incident.
    const pickup = photo('pickup');
    const args = evidenceRpcArgs(pickup, photoStoragePath(pickup));
    expect(args).not.toHaveProperty('p_incident_id');
    expect(args).not.toHaveProperty('p_incident_client_event_id');
  });

  it('counts the photos of an incident taken by its id or by the key of its report', () => {
    const uploaded = photo('incident');
    const takenOffline = photo('incident', { incidentId: null, incidentKey: KEY });
    const otherIncident = photo('incident', {
      incidentId: null,
      incidentKey: '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a',
    });
    const server = [
      {
        stage: 'incident' as const,
        storage_path: photoStoragePath(uploaded),
        incident_id: INCIDENT,
      },
      { stage: 'incident' as const, storage_path: `${TRIP}/incident/z.jpg`, incident_id: INCIDENT },
    ];
    const stored = { pending: [takenOffline, otherIncident], sent: [uploaded] };
    // The report is still on the phone: only the photos taken with its key.
    expect(incidentPhotoCount(server, stored, { incidentId: null, incidentKey: KEY })).toBe(1);
    // Loaded with its id: the server's, plus the ones taken before (by its key), once each.
    expect(incidentPhotoCount(server, stored, { incidentId: INCIDENT, incidentKey: KEY })).toBe(3);
    expect(incidentPhotoCount(server, stored, { incidentId: INCIDENT, incidentKey: null })).toBe(2);
  });
});
