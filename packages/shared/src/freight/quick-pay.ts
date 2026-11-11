// Quick pay (I4, D38): the carrier asks Fulmis to be paid before the client's
// terms and gets its net minus a fee (2.5 % by default, "o más"); the admin
// approves each request, with a total exposure limit. The rules live in
// Postgres (…_quick_pay.sql); these are their pure mirrors (same cases as
// the pgTAP of I4). The fee is rounded by commissionCents, the one rounding
// of I.0.1: to the cent, half up; the quick net is the net minus the fee.
import { quickPayCopy } from '../copy/quick-pay';
// commissionCents is index.ts's (which re-exports this file): only called at run time.
import { commissionCents, type FreightRpcError } from './index';

/** Default quick pay fee: 2.5 % of the carrier's net (D38). */
export const DEFAULT_QUICK_PAY_FEE_BPS = 250;
/** D38: "2.5 % o más"; under 100 %. */
export const QUICK_PAY_FEE_BPS_MIN = 250;
export const QUICK_PAY_FEE_BPS_MAX = 9999;
/** The largest exposure limit the setting takes (15 digits: a safe integer). */
export const QUICK_PAY_EXPOSURE_LIMIT_MAX_CENTS = 999_999_999_999_999;

export const QUICK_PAY_SETTING_KEYS = {
  feeBps: 'freight.quick_pay_fee_bps',
  exposureLimitCents: 'freight.quick_pay_exposure_limit_cents',
} as const;

/**
 * Why the carrier's CFDI to Fulmis does not allow the quick pay
 * (freight_carrier_invoice_blocker): none registered, "Sin validar" because
 * Fulmis has not set its RFC yet, or "Sin validar" and not made out to it.
 */
export const QUICK_PAY_INVOICE_BLOCKERS = [
  'invoice_missing',
  'fulmis_rfc_missing',
  'invoice_unvalidated',
] as const;
export type QuickPayInvoiceBlocker = (typeof QUICK_PAY_INVOICE_BLOCKERS)[number];

/** Why a trip cannot ask for the quick pay (freight_quick_pay_blocker). */
export const QUICK_PAY_BLOCKERS = [
  'not_open',
  'partially_paid',
  'not_delivered',
  ...QUICK_PAY_INVOICE_BLOCKERS,
] as const;
export type QuickPayBlocker = (typeof QUICK_PAY_BLOCKERS)[number];

export function isQuickPayBlocker(value: unknown): value is QuickPayBlocker {
  return QUICK_PAY_BLOCKERS.includes(value as QuickPayBlocker);
}

export function isQuickPayInvoiceBlocker(value: unknown): value is QuickPayInvoiceBlocker {
  return QUICK_PAY_INVOICE_BLOCKERS.includes(value as QuickPayInvoiceBlocker);
}

/**
 * The blocker of a ledger row (carrier_freight_ledger): null when the quick
 * pay can be asked for. A code this build does not know still blocks
 * (`not_open`): the request is never offered on a reason it cannot read.
 */
export function parseQuickPayBlocker(value: unknown): QuickPayBlocker | null {
  if (value === null || value === undefined) return null;
  return isQuickPayBlocker(value) ? value : 'not_open';
}

/**
 * The CFDI blocker of a ledger row (admin_freight_ledger): null when the
 * carrier's CFDI is validated. A code this build does not know still blocks
 * the approval (`invoice_unvalidated`).
 */
export function parseQuickPayInvoiceBlocker(value: unknown): QuickPayInvoiceBlocker | null {
  if (value === null || value === undefined) return null;
  return isQuickPayInvoiceBlocker(value) ? value : 'invoice_unvalidated';
}

/** Mirror of freight_is_valid_quick_pay_fee: an integer 250..9999. */
export function isValidQuickPayFeeBps(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= QUICK_PAY_FEE_BPS_MIN &&
    value <= QUICK_PAY_FEE_BPS_MAX
  );
}

/** Mirror of freight_is_valid_exposure_limit: null (no limit) or positive cents. */
export function isValidExposureLimitCents(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= QUICK_PAY_EXPOSURE_LIMIT_MAX_CENTS)
  );
}

export interface QuickPaySplit {
  netCents: number;
  feeBps: number;
  feeCents: number;
  /** What the carrier gets: the net minus the fee. */
  quickNetCents: number;
}

/**
 * The fee and the quick net of a carrier's net: request_quick_pay's
 * freight_commission_cents(net, fee). They add up to the net.
 */
export function quickPaySplit(netCents: number, feeBps: number): QuickPaySplit {
  const feeCents = commissionCents(netCents, feeBps);
  return { netCents, feeBps, feeCents, quickNetCents: netCents - feeCents };
}

/**
 * The exposure after approving a request: the current one plus what this
 * trip adds (its quick net minus what the client already paid, never below
 * zero), and whether it goes over the limit (none: never). Mirrors
 * admin_approve_quick_pay.
 */
export function projectedExposure(
  currentCents: number,
  quickNetCents: number,
  clientPaidCents: number,
  limitCents: number | null,
): { exposureCents: number; overLimit: boolean } {
  const exposureCents = currentCents + Math.max(quickNetCents - clientPaidCents, 0);
  return { exposureCents, overLimit: limitCents !== null && exposureCents > limitCents };
}

/** The quick pay state of a trip in Cobranza or /admin/flete. */
export type QuickPayState =
  | { kind: 'requested'; at: string }
  | { kind: 'approved'; at: string }
  | { kind: 'rejected'; at: string; reason: string }
  | { kind: 'none' };

/** Which quick pay state a ledger row is in, from its quick pay columns. */
export function quickPayState(row: {
  quick_pay_requested_at: string | null;
  quick_pay_approved_at: string | null;
  quick_pay_rejected_at: string | null;
  quick_pay_rejection_reason: string | null;
}): QuickPayState {
  if (row.quick_pay_approved_at) return { kind: 'approved', at: row.quick_pay_approved_at };
  if (row.quick_pay_requested_at) return { kind: 'requested', at: row.quick_pay_requested_at };
  if (row.quick_pay_rejected_at) {
    return {
      kind: 'rejected',
      at: row.quick_pay_rejected_at,
      reason: row.quick_pay_rejection_reason ?? '',
    };
  }
  return { kind: 'none' };
}

/** An error of the quick pay RPCs (PostgREST: SQLSTATE, message and detail). */
export interface QuickPayRpcError extends FreightRpcError {
  details?: string | null;
}

/**
 * The Spanish text of an error of the quick pay RPCs: request_quick_pay for
 * the carrier, admin_approve_quick_pay and admin_reject_quick_pay for the
 * admin (the reasons about the carrier's CFDI are told to each side). A
 * refusal (55000) says its reason: the blocker or the code in its detail.
 */
export function quickPayErrorText(
  error: QuickPayRpcError,
  side: 'carrier' | 'admin' = 'carrier',
): string {
  const e = quickPayCopy.errors;
  switch (error.code) {
    case '42501':
      return e.notAllowed;
    case '55000':
      switch (error.details) {
        case 'fee_changed':
          return e.feeChanged;
        case 'over_limit':
          return e.overLimit;
        case 'not_requested':
          return e.notRequested;
        default:
          if (side === 'admin' && isQuickPayInvoiceBlocker(error.details)) {
            return quickPayCopy.admin.invoiceBlockers[error.details];
          }
          return isQuickPayBlocker(error.details) ? e.blockers[error.details] : e.generic;
      }
    case '22023':
      return e.reason;
    case 'P0002':
      return e.notRequested;
    default:
      return e.generic;
  }
}
