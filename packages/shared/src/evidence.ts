// Photo evidence of a trip (B23). Postgres enforces the same gate in
// record_trip_event (trip_evidence_missing); this module lets the app say
// which photos the operator still owes before the next step.
import type { EvidenceStage, TripStatus } from './enums';
import type { OperatorTripEvent } from './trips';

/** Stages with a configurable minimum (trip_evidence_requirements). */
export type GatedEvidenceStage = Exclude<EvidenceStage, 'incident'>;

export type EvidenceMinimums = Record<GatedEvidenceStage, number>;

/**
 * Minimums the app assumes until it reads trip_evidence_requirements (same as
 * the migration's defaults). The server always checks its own values.
 */
export const DEFAULT_EVIDENCE_MINIMUMS: EvidenceMinimums = { pickup: 2, delivery: 2 };

/** Longest receiver name `record_trip_event` accepts. */
export const MAX_RECEIVER_NAME_LENGTH = 200;

/** Steps that need the photos of a stage first: leaving the pickup and finishing the delivery. */
export const EVIDENCE_GATED_EVENTS = {
  loading_finished: 'pickup',
  unloading_finished: 'delivery',
} as const satisfies Partial<Record<OperatorTripEvent, GatedEvidenceStage>>;

/** Stage whose photos `event` needs, or null when it needs none. */
export function evidenceStageForEvent(event: OperatorTripEvent): GatedEvidenceStage | null {
  return (
    (EVIDENCE_GATED_EVENTS as Partial<Record<OperatorTripEvent, GatedEvidenceStage>>)[event] ?? null
  );
}

/**
 * Stage the operator photographs at `status`: the pickup while at the origin
 * and loading, the delivery while at the destination, unloading or just
 * delivered (extra photos are still accepted). Null on the road.
 */
export function captureStageForStatus(status: TripStatus): GatedEvidenceStage | null {
  switch (status) {
    case 'at_pickup':
    case 'loading':
      return 'pickup';
    case 'at_delivery':
    case 'unloading':
    case 'delivered':
      return 'delivery';
    default:
      return null;
  }
}

/** Photos still missing to reach `minimum` (never negative). */
export function missingPhotos(minimum: number, taken: number): number {
  return Math.max(minimum - taken, 0);
}

/** Minimums from the rows of trip_evidence_requirements; missing rows keep the default. */
export function evidenceMinimumsFrom(
  rows: readonly { stage: EvidenceStage; min_photos: number }[],
): EvidenceMinimums {
  const minimums = { ...DEFAULT_EVIDENCE_MINIMUMS };
  for (const row of rows) {
    if (row.stage !== 'incident') minimums[row.stage] = row.min_photos;
  }
  return minimums;
}

/**
 * Path of a photo in the private `evidence` bucket: `{trip}/{stage}/{uuid}.jpg`
 * (the bucket policy and add_trip_evidence check the same shape).
 */
export function evidenceStoragePath(input: {
  tripId: string;
  stage: EvidenceStage;
  fileId: string;
}): string {
  return `${input.tripId}/${input.stage}/${input.fileId.toLowerCase()}.jpg`;
}

/** Lowercase hex of a digest (the format of trip_evidence.sha256). */
export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let hex = '';
  for (const byte of view) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
