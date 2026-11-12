import {
  brokeredAdminStage,
  type BrokeredQuoteStatus,
  type FreightCarrierStatus,
  type FreightClientStatus,
  type LoadStatus,
  type StateTone,
} from '@transport/shared';

import { payableDirections } from '../freight/filters';

/*
 * What the admin's dashboard counts and lists (docs/plan-fulmis.md §1.5 and
 * §2 V5): the four indicators and "Requiere tu atención". Pure: the page reads
 * the rows with the queries it already had, and this decides what asks for
 * the admin's hand, in what order.
 */

/** A row of the freight ledger, as far as the dashboard reads it. */
export interface LedgerRow {
  trip_id: string;
  origin_city: string;
  destination_city: string;
  shipper_name: string;
  carrier_name: string;
  client_status: FreightClientStatus;
  carrier_status: FreightCarrierStatus;
  client_due_on: string | null;
  needs_review: boolean;
  quick_pay_approved_at?: string | null;
}

/** A brokered load, as far as the dashboard reads it. */
export interface BrokeredRow {
  load_id: string;
  quote_status: BrokeredQuoteStatus;
  load_status: LoadStatus;
  origin_city: string;
  destination_city: string;
  pending_offers: number;
}

/** What the freight ledger asks of the admin. */
export interface FreightAttention {
  /** Cancelled trips with payments, to resolve by hand. */
  review: LedgerRow[];
  /** Quick pay requests waiting for an answer. */
  quickPay: LedgerRow[];
  /** The client's side is overdue: chase it, or register the SPEI that arrived. */
  overdue: LedgerRow[];
  /** The client paid (or a quick pay was approved): Fulmis owes the carrier. */
  carrierPayable: LedgerRow[];
}

export function freightAttention(rows: readonly LedgerRow[]): FreightAttention {
  const review: LedgerRow[] = [];
  const quickPay: LedgerRow[] = [];
  const overdue: LedgerRow[] = [];
  const carrierPayable: LedgerRow[] = [];
  for (const row of rows) {
    if (row.needs_review) {
      review.push(row);
      continue;
    }
    if (row.carrier_status === 'quick_pay_requested') quickPay.push(row);
    if (row.client_status === 'overdue') overdue.push(row);
    if (payableDirections(row).includes('fulmis_to_carrier')) carrierPayable.push(row);
  }
  return { review, quickPay, overdue, carrierPayable };
}

/** The payments the admin has to register: overdue charges and carriers to pay. */
export function paymentsToRegister(freight: FreightAttention): number {
  return freight.overdue.length + freight.carrierPayable.length;
}

/** The brokered loads waiting for the admin: a price to quote, or offers to answer. */
export function brokeredAttention(rows: readonly BrokeredRow[]): {
  toQuote: BrokeredRow[];
  withOffers: BrokeredRow[];
} {
  const toQuote: BrokeredRow[] = [];
  const withOffers: BrokeredRow[] = [];
  for (const row of rows) {
    const stage = brokeredAdminStage(row.quote_status, row.load_status);
    if (stage === 'toQuote') toQuote.push(row);
    else if (stage === 'published' && row.pending_offers > 0) withOffers.push(row);
  }
  return { toQuote, withOffers };
}

export type AttentionKind =
  | 'review'
  | 'quickPay'
  | 'incident'
  | 'overdue'
  | 'carrierPayment'
  | 'brokered'
  | 'brokeredOffers'
  | 'company'
  | 'document';

/**
 * The order of "Requiere tu atención": what blocks money or a trip first,
 * then what blocks an account. Within a kind the page keeps the order of its
 * query (the oldest first).
 */
export const ATTENTION_ORDER: readonly AttentionKind[] = [
  'review',
  'quickPay',
  'incident',
  'overdue',
  'carrierPayment',
  'brokered',
  'brokeredOffers',
  'company',
  'document',
];

/**
 * The tone of each kind (§1.1): money held or a trip in trouble is a problem;
 * what only the admin can move asks for attention; what waits on a third
 * party is pending.
 */
export const ATTENTION_TONES: Readonly<Record<AttentionKind, StateTone>> = {
  review: 'problem',
  quickPay: 'attention',
  incident: 'problem',
  overdue: 'problem',
  carrierPayment: 'attention',
  brokered: 'attention',
  brokeredOffers: 'attention',
  company: 'pending',
  document: 'pending',
};

export interface AttentionItem {
  kind: AttentionKind;
  key: string;
}

/**
 * The first `limit` items of every kind, in `ATTENTION_ORDER`, and how many
 * were left out. Each item keeps its own data; only the order is decided here.
 */
export function orderAttention<T extends AttentionItem>(
  items: readonly T[],
  limit: number,
): { shown: T[]; hidden: number } {
  const rank = (kind: AttentionKind) => ATTENTION_ORDER.indexOf(kind);
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.kind) - rank(b.item.kind) || a.index - b.index)
    .map(({ item }) => item);
  return { shown: sorted.slice(0, limit), hidden: Math.max(0, sorted.length - limit) };
}
