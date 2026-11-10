import 'server-only';

import { toCents, uuidField, type BrokeredQuoteStatus, type LoadStatus } from '@transport/shared';

import type { Supabase } from '../viewer';

// Reads of the admin's inbox of brokered loads (I6, D39): admin_brokered_loads
// returns both prices of each load (only to admins; the RPC checks it).

export interface AdminBrokeredLoad {
  load_id: string;
  load_status: LoadStatus;
  quote_status: BrokeredQuoteStatus;
  shipper_company_id: string;
  shipper_name: string;
  origin_city: string;
  destination_city: string;
  pickup_window_start: string;
  pickup_window_end: string;
  target_price_cents: number | null;
  client_price_cents: number | null;
  carrier_price_cents: number | null;
  agreed_price_cents: number | null;
  pending_offers: number;
  requested_at: string;
}

const cents = (value: number | null | undefined) =>
  value === null || value === undefined ? null : toCents(value);

function toRow(row: Record<string, unknown>): AdminBrokeredLoad {
  const raw = row as unknown as AdminBrokeredLoad;
  return {
    ...raw,
    target_price_cents: cents(raw.target_price_cents),
    client_price_cents: cents(raw.client_price_cents),
    carrier_price_cents: cents(raw.carrier_price_cents),
    agreed_price_cents: cents(raw.agreed_price_cents),
    pending_offers: Number(raw.pending_offers),
  };
}

/** Every brokered load: the requests to quote first, then by pickup. */
export async function loadAdminBrokered(supabase: Supabase): Promise<AdminBrokeredLoad[]> {
  const { data, error } = await supabase.rpc('admin_brokered_loads').limit(500);
  if (error) throw new Error(`Brokered loads query failed: ${error.message}`);
  return data.map((row) => toRow(row));
}

/** One brokered load, or null when the id is malformed or not a brokered load. */
export async function getAdminBrokered(
  supabase: Supabase,
  loadId: string,
): Promise<AdminBrokeredLoad | null> {
  if (!uuidField.safeParse(loadId).success) return null;
  const { data, error } = await supabase
    .rpc('admin_brokered_loads')
    .eq('load_id', loadId)
    .maybeSingle();
  if (error) throw new Error(`Brokered load query failed: ${error.message}`);
  return data ? toRow(data) : null;
}
