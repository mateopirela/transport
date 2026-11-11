import 'server-only';

import {
  compareFreightOrder,
  fetchFreightPages,
  FREIGHT_PAGE_SIZE,
  FREIGHT_SETTING_KEYS,
  isValidCommissionBps,
  parseFreightPayments,
  parseQuickPayBlocker,
  parseQuickPayInvoiceBlocker,
  toCents,
  type Database,
  type FreightPayment,
  type FreightPaymentDirection,
  type QuickPayBlocker,
  type QuickPayInvoiceBlocker,
} from '@transport/shared';

import type { Supabase } from '../viewer';

// Reads of the freight ledger (I3). Each side reads its own columns through
// its RPC (shipper_freight_ledger, carrier_freight_ledger): the client never
// gets the commission nor the carrier's net, and the carrier never gets the
// client's terms, status or payments (I.0.3). Admins read both sides.

type Fn = Database['public']['Functions'];
type ShipperRow = Fn['shipper_freight_ledger']['Returns'][number];
type CarrierRow = Fn['carrier_freight_ledger']['Returns'][number];
type AdminRow = Fn['admin_freight_ledger']['Returns'][number];

export type ShipperFreightRow = Omit<
  ShipperRow,
  'payments' | 'amount_cents' | 'paid_cents' | 'pending_cents'
> & {
  amount_cents: number;
  paid_cents: number;
  pending_cents: number;
  payments: FreightPayment[];
};

export type CarrierFreightRow = Omit<
  CarrierRow,
  | 'payments'
  | 'freight_cents'
  | 'commission_cents'
  | 'net_cents'
  | 'paid_cents'
  | 'pending_cents'
  | 'quick_pay_fee_cents'
  | 'quick_pay_net_cents'
  | 'quick_pay_blocker'
> & {
  freight_cents: number;
  commission_cents: number;
  net_cents: number;
  paid_cents: number;
  pending_cents: number;
  payments: FreightPayment[];
  /** Quick pay (I4): the frozen fee and what Fulmis pays, once requested. */
  quick_pay_fee_cents: number | null;
  quick_pay_net_cents: number | null;
  /** Why the quick pay cannot be asked for; null when it can. */
  quick_pay_blocker: QuickPayBlocker | null;
};

export interface AdminFreightPayment extends FreightPayment {
  id: string;
  direction: FreightPaymentDirection;
  note: string | null;
}

export type AdminFreightRow = Omit<
  AdminRow,
  | 'payments'
  | 'client_amount_cents'
  | 'commission_cents'
  | 'carrier_net_cents'
  | 'margin_cents'
  | 'client_paid_cents'
  | 'carrier_paid_cents'
  | 'quick_pay_fee_cents'
  | 'carrier_invoice_blocker'
> & {
  client_amount_cents: number;
  commission_cents: number;
  carrier_net_cents: number;
  /** A brokered load's margin (I6): the client's price minus the carrier's. */
  margin_cents: number;
  client_paid_cents: number;
  carrier_paid_cents: number;
  payments: AdminFreightPayment[];
  /** Quick pay (I4): the fee frozen when it was requested. */
  quick_pay_fee_cents: number | null;
  /** Why the carrier's CFDI keeps a quick pay from being approved; null when validated. */
  carrier_invoice_blocker: QuickPayInvoiceBlocker | null;
};

/** Cartera: the client's side of the trips of the caller's company. */
export async function loadShipperFreight(supabase: Supabase): Promise<ShipperFreightRow[]> {
  const data = await fetchFreightPages((after) => {
    const query = supabase.rpc('shipper_freight_ledger');
    return (after ? query.gt('ledger_id', after) : query)
      .order('ledger_id')
      .limit(FREIGHT_PAGE_SIZE);
  }, 'shipper_freight_ledger');
  data.sort((a, b) =>
    compareFreightOrder(
      { dueOn: a.due_on, tripCreatedAt: a.trip_created_at, ledgerId: a.ledger_id },
      { dueOn: b.due_on, tripCreatedAt: b.trip_created_at, ledgerId: b.ledger_id },
    ),
  );
  return data.map((row) => ({
    ...row,
    amount_cents: toCents(row.amount_cents),
    paid_cents: toCents(row.paid_cents),
    pending_cents: toCents(row.pending_cents),
    payments: parseFreightPayments(row.payments),
  }));
}

/** Cobranza: the carrier's side of the trips the caller operates. */
export async function loadCarrierFreight(supabase: Supabase): Promise<CarrierFreightRow[]> {
  const data = await fetchFreightPages((after) => {
    const query = supabase.rpc('carrier_freight_ledger');
    return (after ? query.gt('ledger_id', after) : query)
      .order('ledger_id')
      .limit(FREIGHT_PAGE_SIZE);
  }, 'carrier_freight_ledger');
  data.sort((a, b) =>
    compareFreightOrder(
      { dueOn: a.due_on, tripCreatedAt: a.trip_created_at, ledgerId: a.ledger_id },
      { dueOn: b.due_on, tripCreatedAt: b.trip_created_at, ledgerId: b.ledger_id },
    ),
  );
  return data.map((row) => ({
    ...row,
    freight_cents: toCents(row.freight_cents),
    commission_cents: toCents(row.commission_cents),
    net_cents: toCents(row.net_cents),
    paid_cents: toCents(row.paid_cents),
    pending_cents: toCents(row.pending_cents),
    payments: parseFreightPayments(row.payments),
    quick_pay_fee_cents: nullableCents(row.quick_pay_fee_cents),
    quick_pay_net_cents: nullableCents(row.quick_pay_net_cents),
    quick_pay_blocker: parseQuickPayBlocker(row.quick_pay_blocker),
  }));
}

function nullableCents(value: number | null): number | null {
  return value === null ? null : toCents(value);
}

function adminPayments(value: unknown): AdminFreightPayment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const [parsed] = parseFreightPayments([item]);
    const record = (item ?? {}) as Record<string, unknown>;
    if (!parsed || typeof record.id !== 'string') return [];
    const direction = record.direction;
    if (direction !== 'client_to_fulmis' && direction !== 'fulmis_to_carrier') return [];
    return [
      {
        ...parsed,
        id: record.id,
        direction,
        note: typeof record.note === 'string' ? record.note : null,
      },
    ];
  });
}

/** Admin: both sides of every trip. */
export async function loadAdminFreight(supabase: Supabase): Promise<AdminFreightRow[]> {
  const data = await fetchFreightPages((after) => {
    const query = supabase.rpc('admin_freight_ledger');
    return (after ? query.gt('ledger_id', after) : query)
      .order('ledger_id')
      .limit(FREIGHT_PAGE_SIZE);
  }, 'admin_freight_ledger');
  data.sort((a, b) =>
    compareFreightOrder(
      {
        needsReview: a.needs_review,
        dueOn: a.client_due_on,
        tripCreatedAt: a.trip_created_at,
        ledgerId: a.ledger_id,
      },
      {
        needsReview: b.needs_review,
        dueOn: b.client_due_on,
        tripCreatedAt: b.trip_created_at,
        ledgerId: b.ledger_id,
      },
    ),
  );
  return data.map((row) => ({
    ...row,
    client_amount_cents: toCents(row.client_amount_cents),
    commission_cents: toCents(row.commission_cents),
    carrier_net_cents: toCents(row.carrier_net_cents),
    margin_cents: toCents(row.margin_cents),
    client_paid_cents: toCents(row.client_paid_cents),
    carrier_paid_cents: toCents(row.carrier_paid_cents),
    payments: adminPayments(row.payments),
    quick_pay_fee_cents: nullableCents(row.quick_pay_fee_cents),
    carrier_invoice_blocker: parseQuickPayInvoiceBlocker(row.carrier_invoice_blocker),
  }));
}

/** The default commission (admins only can read it; null when not visible or malformed). */
export async function loadCommissionSetting(supabase: Supabase): Promise<number | null> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', FREIGHT_SETTING_KEYS.commissionBps)
    .maybeSingle();
  if (error) throw new Error(`platform_settings query failed: ${error.message}`);
  const value = data?.value;
  return isValidCommissionBps(value) ? value : null;
}

/**
 * The current quick pay fee (I4) for the carrier staff, to show the quick
 * net before asking. Null when it cannot be read: the page then offers no
 * request (the RPC would check it again anyway).
 */
export async function loadQuickPayFee(supabase: Supabase): Promise<number | null> {
  const { data, error } = await supabase.rpc('carrier_quick_pay_fee_bps');
  if (error) return null;
  return typeof data === 'number' ? data : null;
}

export interface QuickPayAdminState {
  exposureCents: number;
  limitCents: number | null;
  feeBps: number;
}

/** Admin: the quick pay exposure, its limit and the current fee (I4). */
export async function loadQuickPayAdmin(supabase: Supabase): Promise<QuickPayAdminState> {
  const { data, error } = await supabase.rpc('admin_quick_pay_exposure').single();
  if (error) throw new Error(`admin_quick_pay_exposure failed: ${error.message}`);
  return {
    exposureCents: toCents(data.exposure_cents),
    limitCents: data.limit_cents === null ? null : toCents(data.limit_cents),
    feeBps: data.fee_bps,
  };
}
