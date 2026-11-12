import 'server-only';

import {
  carrierNegotiationState,
  expiringDocuments,
  unitLabel,
  type ExpiringDocument,
  type NegotiationOffer,
} from '@transport/shared';

import { selectAll } from '../verification/paging';
import type { Supabase } from '../viewer';
import { listCarrierOperators, listCarrierVehicles, loadFleetContext } from './fleet';

// Reads of the carrier's home as a dashboard (docs/plan-fulmis.md §1.5, V4).
// Only what RLS already shows the staff: no RPC or table of its own. The
// counts of trips and the receivable come from the trips list and the
// collections ledger, which the page reads as those screens do.

/** A counteroffer of the client that waits for the carrier's answer. */
export interface NegotiationToAnswer {
  negotiationId: string;
  route: string;
  amountCents: number;
  businessUnitId: string;
  createdAt: string;
}

interface PendingShipperOffer extends NegotiationOffer {
  negotiation_id: string;
  load_id: string;
  negotiation: { business_unit_id: string } | null;
}

/** Ids per `in` filter of the loads read: keeps each request's URL short. */
const LOAD_BATCH = 200;

/**
 * The negotiations of the given business units whose latest offer is a
 * pending one of the client on a load still open: the carrier's turn
 * ("respond" in carrierNegotiationState). A negotiation holds one pending
 * offer at most (make_offer, counter_offer), so a pending one is its latest.
 * Filtered by business unit in the query (inner join) and read page by page
 * past the 1,000-row cap of PostgREST, so the count is never a prefix.
 * Newest first.
 */
export async function negotiationsToAnswer(
  supabase: Supabase,
  companyId: string,
  businessUnitIds: readonly string[],
): Promise<NegotiationToAnswer[]> {
  if (businessUnitIds.length === 0) return [];
  const offers = await selectAll<PendingShipperOffer>((from, to) =>
    supabase
      .from('offers')
      .select(
        'id, negotiation_id, load_id, side, amount_cents, conditions, vehicle_id, status, status_reason, created_at, negotiation:negotiations!offers_negotiation_fkey!inner(business_unit_id)',
      )
      .eq('carrier_company_id', companyId)
      .eq('side', 'shipper')
      .eq('status', 'pending')
      .in('negotiation.business_unit_id', [...businessUnitIds])
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
      .overrideTypes<PendingShipperOffer[], { merge: false }>(),
  );
  const selected = new Set(businessUnitIds);
  const mine = offers.filter(
    (offer) => offer.negotiation && selected.has(offer.negotiation.business_unit_id),
  );
  if (mine.length === 0) return [];
  const loadIds = [...new Set(mine.map((offer) => offer.load_id))];
  const batches = await Promise.all(
    Array.from({ length: Math.ceil(loadIds.length / LOAD_BATCH) }, async (_, i) => {
      const { data, error } = await supabase
        .from('loads')
        .select('id, origin_city, destination_city, status')
        .in('id', loadIds.slice(i * LOAD_BATCH, (i + 1) * LOAD_BATCH));
      if (error) throw new Error(`Loads query failed: ${error.message}`);
      return data;
    }),
  );
  const loadById = new Map(batches.flat().map((load) => [load.id, load]));
  return mine.flatMap((offer) => {
    const load = loadById.get(offer.load_id);
    if (!load || !offer.negotiation) return [];
    if (carrierNegotiationState([offer], load.status) !== 'respond') return [];
    return [
      {
        negotiationId: offer.negotiation_id,
        route: `${load.origin_city} → ${load.destination_city}`,
        amountCents: offer.amount_cents,
        businessUnitId: offer.negotiation.business_unit_id,
        createdAt: offer.created_at,
      },
    ];
  });
}

/**
 * The documents of the units and operators of the given business units that
 * expire within the window (EXPIRY_WINDOW_DAYS), soonest first.
 */
export async function fleetExpiringDocuments(
  supabase: Supabase,
  companyId: string,
  businessUnitIds: readonly string[],
): Promise<ExpiringDocument[]> {
  if (businessUnitIds.length === 0) return [];
  const context = await loadFleetContext(supabase, companyId);
  const [vehicles, operators] = await Promise.all([
    listCarrierVehicles(supabase, context, businessUnitIds),
    listCarrierOperators(supabase, companyId, businessUnitIds),
  ]);
  return expiringDocuments(context, [
    ...vehicles.map((v) => ({ type: 'vehicle' as const, id: v.id, label: unitLabel(v) })),
    ...operators.map((o) => ({ type: 'operator' as const, id: o.id, label: o.full_name })),
  ]);
}
