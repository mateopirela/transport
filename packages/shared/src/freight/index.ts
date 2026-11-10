// Freight ledger (I3, D08-E2, D33-E1, D34-E1). Fulmis invoices the client
// 100 % of the freight and pays the carrier the freight minus its commission;
// money moves by SPEI outside the app and the admin records it. The rules
// live in Postgres (…_freight_ledger.sql); these are their pure mirrors, for
// the screens and the tests (same cases as the pgTAP of I3).
//
// Money is integer cents (I.0.1) and percentages are basis points (300 = 3 %).
// Rounding happens in one place, commissionCents: to the cent, half up; the
// carrier's net is the amount minus the commission, so the parts always add
// up to the total.
import { freightCopy } from '../copy/freight';
import type { FreightCarrierStatus, FreightClientStatus } from '../enums';
import { toMexicoCityDate } from '../verification';

/** The terms a client may have (D33-E1), in calendar days after the delivery. */
export const PAYMENT_TERMS_DAYS = [15, 30, 60] as const;
export type PaymentTermsDays = (typeof PAYMENT_TERMS_DAYS)[number];

/** Default commission of Fulmis per trip: 3 %. */
export const DEFAULT_COMMISSION_BPS = 300;
/** A commission is 0 (no commission, §I.2) or between 3 % and 5 % (D33-E1). */
export const COMMISSION_BPS_MIN = 300;
export const COMMISSION_BPS_MAX = 500;

export const FREIGHT_SETTING_KEYS = { commissionBps: 'freight.commission_bps' } as const;

export function isPaymentTermsDays(value: unknown): value is PaymentTermsDays {
  return PAYMENT_TERMS_DAYS.includes(value as PaymentTermsDays);
}

/** Mirror of freight_is_valid_commission: an integer 0 or 300..500. */
export function isValidCommissionBps(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (value === 0 || (value >= COMMISSION_BPS_MIN && value <= COMMISSION_BPS_MAX))
  );
}

function assertCents(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a non-negative integer of cents: ${String(value)}`);
  }
}

/**
 * Mirror of freight_commission_cents: amount × bps / 10 000, rounded to the
 * cent, half up. BigInt arithmetic, never floats.
 */
export function commissionCents(amountCents: number, bps: number): number {
  assertCents(amountCents, 'amount');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError(`basis points must be an integer between 0 and 10000: ${String(bps)}`);
  }
  return Number((BigInt(amountCents) * BigInt(bps) + 5000n) / 10_000n);
}

export interface FreightSplit {
  clientAmountCents: number;
  commissionBps: number;
  commissionCents: number;
  carrierNetCents: number;
}

/** The commission and the carrier's net of an amount; they add up to it. */
export function freightSplit(amountCents: number, bps: number): FreightSplit {
  const commission = commissionCents(amountCents, bps);
  return {
    clientAmountCents: amountCents,
    commissionBps: bps,
    commissionCents: commission,
    carrierNetCents: amountCents - commission,
  };
}

/** "3 %", "2.5 %", "0 %": basis points as a percentage, without floats. */
export function formatBasisPoints(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError(`Invalid basis points: ${bps}`);
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/u, '');
  return `${whole}${fraction ? `.${fraction}` : ''} %`;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A calendar date (YYYY-MM-DD) plus `days` calendar days. */
export function addCalendarDays(date: string, days: number): string {
  const match = CALENDAR_DATE.exec(date);
  if (!match || !Number.isInteger(days))
    throw new RangeError(`Invalid date or days: ${date}, ${days}`);
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (value.toISOString().slice(0, 10) !== date) throw new RangeError(`Invalid date: ${date}`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Mirror of freight_due_on: the day of the delivery in Mexico City plus the
 * terms, in calendar days. Null without a delivery or without terms.
 */
export function freightDueOn(
  deliveredAt: string | null | undefined,
  termsDays: number | null | undefined,
): string | null {
  if (!deliveredAt || termsDays === null || termsDays === undefined) return null;
  return addCalendarDays(toMexicoCityDate(deliveredAt), termsDays);
}

/** Mirror of freight_effective_client_status: pending or invoiced past the due date is overdue. */
export function effectiveClientStatus(
  status: FreightClientStatus,
  dueOn: string | null | undefined,
  today: string,
): FreightClientStatus {
  return (status === 'pending' || status === 'invoiced') && dueOn && dueOn < today
    ? 'overdue'
    : status;
}

/**
 * Mirror of freight_effective_carrier_status: only a pending payment past its
 * date is held while the client has not paid. A quick pay request, a
 * scheduled or a paid payment never goes back.
 */
export function effectiveCarrierStatus(
  status: FreightCarrierStatus,
  dueOn: string | null | undefined,
  clientPaid: boolean,
  today: string,
): FreightCarrierStatus {
  return status === 'pending' && dueOn && dueOn < today && !clientPaid ? 'on_hold' : status;
}

export interface FreightPayment {
  amountCents: number;
  /** YYYY-MM-DD. */
  paidOn: string;
  speiReference: string;
}

/** The payments of a read RPC (jsonb), validated. */
export function parseFreightPayments(value: unknown): FreightPayment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { amountCents, paidOn, speiReference } = item as Record<string, unknown>;
    if (
      typeof amountCents !== 'number' ||
      !Number.isSafeInteger(amountCents) ||
      typeof paidOn !== 'string' ||
      !CALENDAR_DATE.test(paidOn) ||
      typeof speiReference !== 'string'
    ) {
      return [];
    }
    return [{ amountCents, paidOn, speiReference }];
  });
}

/** Rows per request of the ledger reads; PostgREST caps a response (1,000 by default). */
export const FREIGHT_PAGE_SIZE = 1000;

/** What orders a row of the ledger reads (the ORDER BY of their RPCs). */
export interface FreightOrderKey {
  /** The admin's trips to review go first. */
  needsReview?: boolean;
  /** The due date of the side (YYYY-MM-DD); trips without one go last. */
  dueOn: string | null;
  /** The trip's creation (ISO); the newest first. */
  tripCreatedAt: string;
  /** The ledger id: the unique tiebreaker. */
  ledgerId: string;
}

function timeOf(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The display order of the ledger reads, the same as their RPCs: review
 * first (admin), due date (none last), newest trip, ledger id. The apps read
 * the RPCs in pages by ledger id and sort the rows again with this.
 */
export function compareFreightOrder(a: FreightOrderKey, b: FreightOrderKey): number {
  const review = Number(Boolean(b.needsReview)) - Number(Boolean(a.needsReview));
  if (review !== 0) return review;
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  const created = timeOf(b.tripCreatedAt) - timeOf(a.tripCreatedAt);
  if (created !== 0) return created;
  if (a.ledgerId === b.ledgerId) return 0;
  return a.ledgerId < b.ledgerId ? -1 : 1;
}

/**
 * Every row of a ledger read, in pages by ledger id (keyset): each request
 * asks for the rows after the last id it got. The ledger id never changes, so
 * a row that changes or leaves while the pages load never makes another row
 * skipped or repeated (an offset would). `fetchPage(after)` gets up to
 * FREIGHT_PAGE_SIZE rows with a ledger id above `after` (all when null),
 * ordered by ledger id.
 */
export async function fetchFreightPages<T extends { ledger_id: string }>(
  fetchPage: (
    after: string | null,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await fetchPage(after);
    if (error) throw new Error(`${label} failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    const last = page.at(-1);
    if (page.length < FREIGHT_PAGE_SIZE || !last) return rows;
    after = last.ledger_id;
  }
}

export interface CollectionsRow {
  status: FreightCarrierStatus;
  pendingCents: number;
  payments: readonly FreightPayment[];
}

export interface CollectionsTotals {
  /** "Por cobrar": what Fulmis still owes, not held. */
  receivableCents: number;
  /** "Retenido": held because the client has not paid. */
  onHoldCents: number;
  /** "Pagado este mes": payments to the carrier this calendar month (Mexico City). */
  paidThisMonthCents: number;
}

/** The totals of "Cobranza" (carrier). Cancelled trips are out of every total. */
export function collectionsTotals(
  rows: readonly CollectionsRow[],
  today: string,
): CollectionsTotals {
  const month = today.slice(0, 7);
  let receivableCents = 0;
  let onHoldCents = 0;
  let paidThisMonthCents = 0;
  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    if (row.status === 'on_hold') onHoldCents += row.pendingCents;
    else if (row.status !== 'paid') receivableCents += row.pendingCents;
    for (const payment of row.payments) {
      if (payment.paidOn.startsWith(month)) paidThisMonthCents += payment.amountCents;
    }
  }
  return { receivableCents, onHoldCents, paidThisMonthCents };
}

export interface PortfolioRow {
  status: FreightClientStatus;
  pendingCents: number;
}

export interface PortfolioTotals {
  /** "Saldo total": what the client still owes. */
  balanceCents: number;
  /** "Vencido": the part past its due date. */
  overdueCents: number;
  /** "Por vencer": the rest. */
  upcomingCents: number;
}

/** The totals of "Cartera" (client). Paid, written off and cancelled trips owe nothing. */
export function portfolioTotals(rows: readonly PortfolioRow[]): PortfolioTotals {
  let balanceCents = 0;
  let overdueCents = 0;
  for (const row of rows) {
    if (row.status !== 'pending' && row.status !== 'invoiced' && row.status !== 'overdue') continue;
    balanceCents += row.pendingCents;
    if (row.status === 'overdue') overdueCents += row.pendingCents;
  }
  return { balanceCents, overdueCents, upcomingCents: balanceCents - overdueCents };
}

export type FreightTone = 'accent' | 'ok' | 'amber' | 'red' | 'neutral';

/** Pill tone of the client's side: owed in the accent, overdue red, paid ok. */
export function freightClientStatusTone(status: FreightClientStatus): FreightTone {
  switch (status) {
    case 'pending':
    case 'invoiced':
      return 'accent';
    case 'paid':
      return 'ok';
    case 'overdue':
      return 'red';
    case 'written_off':
    case 'cancelled':
      return 'neutral';
  }
}

/** Pill tone of the carrier's side: held amber, scheduled or quick pay accent, paid ok. */
export function freightCarrierStatusTone(status: FreightCarrierStatus): FreightTone {
  switch (status) {
    case 'pending':
      return 'neutral';
    case 'on_hold':
      return 'amber';
    case 'quick_pay_requested':
    case 'scheduled':
      return 'accent';
    case 'paid':
      return 'ok';
    case 'cancelled':
      return 'neutral';
  }
}

/** Normalizes a SPEI reference as Postgres stores it: no spaces, upper case. */
export function normalizeSpeiReference(value: string): string {
  return value.replace(/\s/gu, '').toUpperCase();
}

/** Whether a (normalized) SPEI reference is valid: 1 to 30 letters and digits. */
export function isValidSpeiReference(value: string): boolean {
  return /^[A-Z0-9]{1,30}$/u.test(value);
}

/** An error of the admin's freight RPCs (PostgREST: SQLSTATE and message). */
export interface FreightRpcError {
  code?: string | null;
  message?: string | null;
}

/** The Spanish text of an error of the admin's freight RPCs. */
export function freightAdminErrorText(error: FreightRpcError): string {
  const e = freightCopy.admin.errors;
  const message = error.message ?? '';
  switch (error.code) {
    case '42501':
      return e.notAdmin;
    case '23505':
      return e.duplicateReference;
    case 'P0002':
      return e.notFound;
    case '55000':
      return message.includes('review') ? e.noReview : e.closed;
    case '22023':
      if (message.includes('more than what is owed')) return e.overpaid;
      if (message.includes('SPEI reference')) return e.reference;
      if (message.includes('payment date')) return e.date;
      if (message.includes('positive amount')) return e.amount;
      if (message.includes('note')) return e.note;
      return e.invalid;
    case '23514':
      return e.invalid;
    default:
      return e.generic;
  }
}

export * from './cfdi';
export * from './invoices';
