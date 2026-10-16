import 'server-only';

import { toCents, uuidField, type LoadStatus } from '@transport/shared';

import type { Supabase } from '../viewer';
import { buildOfferBoard, type BoardOffer, type BoardRow } from './board';

const OFFER_COLUMNS =
  'id, negotiation_id, side, amount_cents, conditions, vehicle_id, status, status_reason, created_at';

/** Rows per request; PostgREST caps a response (1,000 by default). */
const OFFERS_PAGE_SIZE = 1000;

/** Every offer of a load, in pages, so a long history is never cut short. */
async function listLoadOffers(supabase: Supabase, loadId: string): Promise<BoardOffer[]> {
  const offers: BoardOffer[] = [];
  for (let from = 0; ; from += OFFERS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('offers')
      .select(OFFER_COLUMNS)
      .eq('load_id', loadId)
      .order('created_at')
      .order('id')
      .range(from, from + OFFERS_PAGE_SIZE - 1);
    if (error) throw new Error(`Offers query failed: ${error.message}`);
    offers.push(...data.map((o) => ({ ...o, amount_cents: toCents(o.amount_cents) })));
    if (data.length < OFFERS_PAGE_SIZE) return offers;
  }
}

/**
 * Offers inbox of a load: offers through RLS (only the load's two companies
 * see them), carriers and proposed units through the B14 RPCs, which return
 * nothing unless the caller owns the load.
 */
export async function getOfferBoard(
  supabase: Supabase,
  load: { id: string; status: LoadStatus; proposed_price_cents: number },
): Promise<BoardRow[]> {
  const [offers, carriers, vehicles] = await Promise.all([
    listLoadOffers(supabase, load.id),
    supabase.rpc('load_negotiation_carriers', { p_load_id: load.id }),
    supabase.rpc('load_offer_vehicles', { p_load_id: load.id }),
  ]);
  if (carriers.error) throw new Error(`Carriers query failed: ${carriers.error.message}`);
  if (vehicles.error) throw new Error(`Vehicles query failed: ${vehicles.error.message}`);

  return buildOfferBoard({
    loadStatus: load.status,
    proposedPriceCents: toCents(load.proposed_price_cents),
    offers,
    carriers: carriers.data.map((c) => ({ ...c, unread_messages: Number(c.unread_messages) })),
    vehicles: vehicles.data.map((v) => ({
      ...v,
      capacity_m3: v.capacity_m3 === null ? null : Number(v.capacity_m3),
    })),
  });
}

/** One negotiation of the board, or null when the id is malformed or unknown. */
export function findNegotiation(board: readonly BoardRow[], negotiationId: string) {
  if (!uuidField.safeParse(negotiationId).success) return null;
  return board.find((row) => row.negotiationId === negotiationId) ?? null;
}
