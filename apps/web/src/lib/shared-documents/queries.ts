import 'server-only';

import type { ProviderStatus, SharedDocumentRow } from '@transport/shared';

import type { Supabase } from '../viewer';

/**
 * The documents shared on a trip (trip_shared_documents: no storage paths).
 * The shipper gets the ones in force; the carrier staff, also the revoked
 * ones. A trip the caller cannot see is an error of the RPC: an empty list.
 */
export async function getSharedDocuments(
  supabase: Supabase,
  tripId: string,
): Promise<SharedDocumentRow[]> {
  const { data, error } = await supabase.rpc('trip_shared_documents', { p_trip_id: tripId });
  if (error) {
    if (error.code === '42501') return [];
    throw new Error(`Shared documents query failed: ${error.message}`);
  }
  return data ?? [];
}

export interface ProviderDecision {
  status: ProviderStatus;
  decidedAt: string;
  notes: string | null;
}

/**
 * The provider decisions of a shipper about some carriers (no row = pending),
 * by carrier company id. RLS shows each party only its own pairs.
 */
export async function getProviderDecisions(
  supabase: Supabase,
  {
    shipperCompanyId,
    carrierCompanyIds,
  }: { shipperCompanyId: string; carrierCompanyIds: string[] },
): Promise<Map<string, ProviderDecision>> {
  const decisions = new Map<string, ProviderDecision>();
  const ids = [...new Set(carrierCompanyIds)];
  if (ids.length === 0) return decisions;
  const { data, error } = await supabase
    .from('provider_approvals')
    .select('carrier_company_id, status, decided_at, notes')
    .eq('shipper_company_id', shipperCompanyId)
    .in('carrier_company_id', ids);
  if (error) throw new Error(`Provider approvals query failed: ${error.message}`);
  for (const row of data) {
    decisions.set(row.carrier_company_id, {
      status: row.status,
      decidedAt: row.decided_at,
      notes: row.notes,
    });
  }
  return decisions;
}

/** The decision of a trip's shipper about the carrier, as the carrier staff sees it. */
export async function getProviderDecisionForCarrier(
  supabase: Supabase,
  { shipperCompanyId, carrierCompanyId }: { shipperCompanyId: string; carrierCompanyId: string },
): Promise<ProviderDecision | null> {
  const { data, error } = await supabase
    .from('provider_approvals')
    .select('status, decided_at, notes')
    .eq('shipper_company_id', shipperCompanyId)
    .eq('carrier_company_id', carrierCompanyId)
    .maybeSingle();
  if (error) throw new Error(`Provider approval query failed: ${error.message}`);
  return data ? { status: data.status, decidedAt: data.decided_at, notes: data.notes } : null;
}
