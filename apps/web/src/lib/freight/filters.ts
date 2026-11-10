import type {
  FreightCarrierStatus,
  FreightClientStatus,
  FreightPaymentDirection,
} from '@transport/shared';

// Filters of the admin's freight ledger (/admin/flete?filtro=…). Pure, so the
// page and the tests share them.

export const FREIGHT_FILTERS = [
  'todos',
  'vencidos',
  'cliente',
  'transportista',
  'retenidos',
  'rapido',
  'revisar',
] as const;
export type FreightFilter = (typeof FREIGHT_FILTERS)[number];

export function parseFreightFilter(value: unknown): FreightFilter {
  return FREIGHT_FILTERS.includes(value as FreightFilter) ? (value as FreightFilter) : 'todos';
}

export interface FreightFilterRow {
  client_status: FreightClientStatus;
  carrier_status: FreightCarrierStatus;
  needs_review: boolean;
}

const CLIENT_OPEN: readonly FreightClientStatus[] = ['pending', 'invoiced', 'overdue'];
const CARRIER_OPEN: readonly FreightCarrierStatus[] = [
  'pending',
  'on_hold',
  'quick_pay_requested',
  'scheduled',
];

export function matchesFreightFilter(row: FreightFilterRow, filter: FreightFilter): boolean {
  switch (filter) {
    case 'todos':
      return true;
    case 'vencidos':
      return row.client_status === 'overdue';
    case 'cliente':
      return CLIENT_OPEN.includes(row.client_status);
    case 'transportista':
      return CARRIER_OPEN.includes(row.carrier_status);
    case 'retenidos':
      return row.carrier_status === 'on_hold';
    // I4: the quick pay requests waiting for the admin.
    case 'rapido':
      return row.carrier_status === 'quick_pay_requested';
    case 'revisar':
      return row.needs_review;
  }
}

/**
 * The sides of a trip that can still take a payment, client first. The
 * carrier takes none while its quick pay request waits for the admin (I4).
 */
export function payableDirections(row: {
  client_status: FreightClientStatus;
  carrier_status: FreightCarrierStatus;
  quick_pay_approved_at?: string | null;
}): FreightPaymentDirection[] {
  const directions: FreightPaymentDirection[] = [];
  if (row.client_status !== 'paid' && row.client_status !== 'cancelled') {
    directions.push('client_to_fulmis');
  }
  // D33-E1: the carrier is paid once the client paid; before, only with an
  // approved quick pay (D38). admin_record_freight_payment enforces it too.
  const clientSettled =
    row.client_status === 'paid' || (row.quick_pay_approved_at ?? null) !== null;
  if (
    clientSettled &&
    row.carrier_status !== 'paid' &&
    row.carrier_status !== 'cancelled' &&
    row.carrier_status !== 'quick_pay_requested'
  ) {
    directions.push('fulmis_to_carrier');
  }
  return directions;
}

/**
 * Whether the carrier's side is owed but waits for the client (D33-E1): not
 * paid nor cancelled, no quick pay requested or approved, and the client has
 * not paid in full. The admin page says so instead of offering the payment.
 */
export function carrierWaitsForClient(row: {
  client_status: FreightClientStatus;
  carrier_status: FreightCarrierStatus;
  quick_pay_approved_at?: string | null;
}): boolean {
  return (
    (row.carrier_status === 'pending' || row.carrier_status === 'on_hold') &&
    row.client_status !== 'paid' &&
    row.client_status !== 'cancelled' &&
    (row.quick_pay_approved_at ?? null) === null
  );
}
