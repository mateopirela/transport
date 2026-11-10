import {
  compareFreightOrder,
  fetchFreightPages,
  FREIGHT_PAGE_SIZE,
  parseFreightPayments,
  toCents,
  type Database,
  type FreightPayment,
} from '@transport/shared';

import type { Supabase } from './supabase';

// "Cobranza" in the app (I3, D34-E1): what Fulmis pays the carrier for each
// trip. carrier_freight_ledger returns only the carrier's columns (freight,
// commission, net, its date, its status and its own payments): the Gerente
// gets the whole company, a Coordinador their business units and an operator
// nothing.

type Row = Database['public']['Functions']['carrier_freight_ledger']['Returns'][number];

export type CollectionRow = Omit<
  Row,
  'payments' | 'freight_cents' | 'commission_cents' | 'net_cents' | 'paid_cents' | 'pending_cents'
> & {
  freight_cents: number;
  commission_cents: number;
  net_cents: number;
  paid_cents: number;
  pending_cents: number;
  payments: FreightPayment[];
};

/**
 * Every trip of the carrier, in pages by ledger id (the totals need all of
 * them, never the first 1,000), in the order of the RPC.
 */
export async function loadCollections(client: Supabase): Promise<CollectionRow[]> {
  const data = await fetchFreightPages<Row>((after) => {
    const query = client.rpc('carrier_freight_ledger');
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
  }));
}
