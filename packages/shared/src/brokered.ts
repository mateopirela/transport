// Brokered loads (I6, D39). A client sends a load to the platform; Transport
// sets the client's price and a lower (or equal) rate for the carriers, the
// client approves its price and the load is published at the rate. The rules
// live in Postgres (…_brokered_loads.sql); these are their pure mirrors for
// the screens and the tests. Money is integer cents (I.0.1).
import type { BrokeredQuoteStatus, LoadStatus } from './enums';
import { MAX_AMOUNT_CENTS } from './money';

/** What is wrong with a quote, as admin_quote_brokered_load checks it. */
export type BrokeredQuoteProblem = 'clientPrice' | 'carrierPrice' | 'carrierOverClient';

function isPrice(value: number | null | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_AMOUNT_CENTS
  );
}

/**
 * Mirror of the checks of admin_quote_brokered_load: both prices are positive
 * cents up to MAX_AMOUNT_CENTS and the carriers' rate is never over the
 * client's price (Transport never loses on a load). Null when it is valid.
 */
export function brokeredQuoteProblem(
  clientPriceCents: number | null | undefined,
  carrierPriceCents: number | null | undefined,
): BrokeredQuoteProblem | null {
  if (!isPrice(clientPriceCents)) return 'clientPrice';
  if (!isPrice(carrierPriceCents)) return 'carrierPrice';
  return carrierPriceCents > clientPriceCents ? 'carrierOverClient' : null;
}

/**
 * The margin of Transport on a brokered load: the client's price minus the
 * carrier's (freight_ledgers.margin_cents). Admins only.
 */
export function brokeredMarginCents(clientPriceCents: number, carrierPriceCents: number): number {
  for (const value of [clientPriceCents, carrierPriceCents]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`prices must be non-negative integers of cents: ${String(value)}`);
    }
  }
  if (carrierPriceCents > clientPriceCents) {
    throw new RangeError('the carrier price cannot be over the client price');
  }
  return clientPriceCents - carrierPriceCents;
}

/**
 * Where a brokered load is, as its client follows it: sent to Transport,
 * priced and waiting for the client's approval, or published while Transport
 * looks for the carrier. Null once contracted, cancelled or expired (the
 * load's own status says it then) and for a load that is not brokered.
 */
export type BrokeredClientStage = 'requested' | 'quoted' | 'searching';

export function brokeredClientStage(
  quoteStatus: BrokeredQuoteStatus | null | undefined,
  loadStatus: LoadStatus,
): BrokeredClientStage | null {
  if (!quoteStatus) return null;
  if (loadStatus === 'draft') return quoteStatus === 'approved' ? null : quoteStatus;
  if (loadStatus === 'published' || loadStatus === 'negotiating') {
    return quoteStatus === 'approved' ? 'searching' : null;
  }
  return null;
}

/** Where a brokered load is in the admin's inbox (/admin/intermediadas). */
export type BrokeredAdminStage =
  'toQuote' | 'waitingClient' | 'published' | 'contracted' | 'closed';

export function brokeredAdminStage(
  quoteStatus: BrokeredQuoteStatus,
  loadStatus: LoadStatus,
): BrokeredAdminStage {
  if (loadStatus === 'cancelled' || loadStatus === 'expired') return 'closed';
  if (loadStatus === 'published' || loadStatus === 'negotiating') return 'published';
  if (loadStatus === 'draft') return quoteStatus === 'requested' ? 'toQuote' : 'waitingClient';
  return 'contracted';
}
