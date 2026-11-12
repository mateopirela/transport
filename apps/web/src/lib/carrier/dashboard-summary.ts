import { toMexicoCityDate, type CarrierNegotiationState, type StateTone } from '@transport/shared';

import type { FleetContext } from './fleet-summary';

// Pure part of the carrier's home as a dashboard (docs/plan-fulmis.md §1.5,
// V4): which documents are about to expire and how a negotiation reads as a
// tone. No I/O, so Vitest covers it; dashboard.ts loads the rows.

/**
 * Days ahead the home counts a document as "por vencer": the first notice of
 * process_document_expiry (its thresholds are 30 and 7 days).
 */
export const EXPIRY_WINDOW_DAYS = 30;

/** A unit or an operator the viewer sees, named as its screens name it. */
export interface FleetOwner {
  type: 'vehicle' | 'operator';
  id: string;
  label: string;
}

export interface ExpiringDocument {
  documentId: string;
  requirementName: string;
  owner: FleetOwner;
  expiresAt: string;
  /** Calendar days left in Mexico City: 0 is today. */
  daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight (UTC) of the Mexico City calendar day of a timestamp, to count whole days. */
function calendarDay(timestamp: string): number {
  return Date.parse(`${toMexicoCityDate(timestamp)}T00:00:00Z`);
}

/**
 * The approved documents of the given owners that expire within the window,
 * soonest first. Like requirementProgress, the latest active document of each
 * requirement and owner decides: one already replaced by a newer submission
 * does not count, and an expired one is no longer "por vencer" (the unit's
 * readiness says it).
 */
export function expiringDocuments(
  context: Pick<FleetContext, 'requirements' | 'documents'>,
  owners: readonly FleetOwner[],
  now: Date = new Date(),
  windowDays: number = EXPIRY_WINDOW_DAYS,
): ExpiringDocument[] {
  const ownerByKey = new Map(owners.map((owner) => [`${owner.type}:${owner.id}`, owner]));
  const names = new Map(context.requirements.map((r) => [r.id, r.name]));
  const latest = new Map<string, FleetContext['documents'][number]>();
  for (const document of context.documents) {
    if (document.archived_at !== null) continue;
    const key = `${document.owner_type}:${document.owner_id}:${document.requirement_id}`;
    const current = latest.get(key);
    if (!current || Date.parse(document.created_at) > Date.parse(current.created_at)) {
      latest.set(key, document);
    }
  }
  const limit = now.getTime() + windowDays * DAY_MS;
  const today = calendarDay(now.toISOString());
  const found: ExpiringDocument[] = [];
  for (const document of latest.values()) {
    const owner = ownerByKey.get(`${document.owner_type}:${document.owner_id}`);
    const name = names.get(document.requirement_id);
    if (!owner || !name || document.status !== 'approved' || !document.expires_at) continue;
    const expires = Date.parse(document.expires_at);
    if (expires <= now.getTime() || expires > limit) continue;
    found.push({
      documentId: document.id,
      requirementName: name,
      owner,
      expiresAt: document.expires_at,
      daysLeft: Math.round((calendarDay(document.expires_at) - today) / DAY_MS),
    });
  }
  return found.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
}

/**
 * A negotiation as the carrier sees it (§1.1): their turn asks them to act,
 * a won one is done, waiting on the client is pending, and the ones that went
 * nowhere are inactive.
 */
export function carrierNegotiationTone(state: CarrierNegotiationState): StateTone {
  switch (state) {
    case 'respond':
      return 'attention';
    case 'won':
      return 'done';
    case 'awaiting_shipper':
      return 'pending';
    case 'open':
    case 'reopen':
      return 'progress';
    case 'lost':
    case 'closed':
      return 'inactive';
  }
}

/** The first `limit` items and how many were left out ("y 3 más"). */
export function firstOf<T>(items: readonly T[], limit: number): { shown: T[]; more: number } {
  return { shown: items.slice(0, limit), more: Math.max(items.length - limit, 0) };
}
