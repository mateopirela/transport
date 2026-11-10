import {
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

export async function loadCollections(client: Supabase): Promise<CollectionRow[]> {
  const { data, error } = await client.rpc('carrier_freight_ledger');
  if (error) throw error;
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
