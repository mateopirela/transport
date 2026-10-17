// Checklist of a trip (D22, G3): the documents, photos and signature the trip
// needs, grouped by stage. Rows come from the trip_checklist RPC; the
// requirement rows from trip_document_requirements. Pure, so the carrier app,
// the operator app and the shipper web share one grouping and one upload rule
// (add_trip_document validates it again).
import type { OfferSide, TripDocumentKind } from './enums';

/** One row of the trip_checklist RPC. */
export interface TripChecklistRow {
  /** A trip_document_kind, or `pickup_evidence`, `delivery_evidence`, `delivery_receipt`. */
  code: string;
  /** `before_departure` or `billing` for documents; `pickup` or `delivery` for the operator's part. */
  stage: string;
  /** Who does it: `shipper`, `carrier` or `operator`. */
  responsible: string;
  required: boolean;
  done_at: string | null;
}

/** Stages in the order they happen; unknown stages (new data) go last. */
export const TRIP_CHECKLIST_STAGES = ['before_departure', 'pickup', 'delivery', 'billing'] as const;
export type TripChecklistStage = (typeof TRIP_CHECKLIST_STAGES)[number];

export type TripChecklistResponsible = 'shipper' | 'carrier' | 'operator';

export interface TripChecklistGroup {
  stage: TripChecklistStage | string;
  rows: TripChecklistRow[];
  /** Required rows still pending. */
  pending: number;
}

/** Rows by stage, in stage order, without empty stages. */
export function groupTripChecklist(rows: readonly TripChecklistRow[]): TripChecklistGroup[] {
  const order = new Map<string, number>(TRIP_CHECKLIST_STAGES.map((s, i) => [s, i]));
  const groups = new Map<string, TripChecklistRow[]>();
  for (const row of rows) {
    const list = groups.get(row.stage) ?? [];
    list.push(row);
    groups.set(row.stage, list);
  }
  return [...groups.entries()]
    .sort(
      ([a], [b]) =>
        (order.get(a) ?? TRIP_CHECKLIST_STAGES.length) -
          (order.get(b) ?? TRIP_CHECKLIST_STAGES.length) || a.localeCompare(b),
    )
    .map(([stage, list]) => ({
      stage,
      rows: list,
      pending: list.filter((r) => r.required && r.done_at === null).length,
    }));
}

/** Required items of the whole checklist still pending. */
export function tripChecklistPending(rows: readonly TripChecklistRow[]): number {
  return rows.filter((r) => r.required && r.done_at === null).length;
}

/** What add_trip_document needs to know about a kind. */
export interface TripDocumentRequirement {
  kind: TripDocumentKind;
  uploader_sides: OfferSide[];
  sort_order: number;
}

/** Kinds `side` may upload, in catalog order (mirrors add_trip_document). */
export function uploadableTripDocumentKinds(
  requirements: readonly TripDocumentRequirement[],
  side: OfferSide,
): TripDocumentKind[] {
  return [...requirements]
    .filter((r) => r.uploader_sides.includes(side))
    .sort((a, b) => a.sort_order - b.sort_order || a.kind.localeCompare(b.kind))
    .map((r) => r.kind);
}

/** Whether `code` of the checklist is a document kind (the rest is evidence). */
export function isTripDocumentCode(
  code: string,
  kinds: readonly TripDocumentKind[],
): code is TripDocumentKind {
  return (kinds as readonly string[]).includes(code);
}
