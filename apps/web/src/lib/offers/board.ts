// Offers inbox of a load (B14): one row per negotiation, built from the
// offers (RLS) and the carriers and units the B14 RPCs expose. Pure, so the
// ordering and the allowed actions are unit-tested.
import {
  formatMxn,
  type LoadStatus,
  type OfferSide,
  type OfferStatus,
  type SpecialRequirement,
  type UnitType,
  type VehicleKind,
  type VerificationStatus,
} from '@transport/shared';

export interface BoardOffer {
  id: string;
  negotiation_id: string;
  side: OfferSide;
  amount_cents: number;
  conditions: string | null;
  vehicle_id: string | null;
  status: OfferStatus;
  status_reason: string | null;
  created_at: string;
}

/** A row of `load_negotiation_carriers`. */
export interface BoardCarrier {
  negotiation_id: string;
  conversation_id: string | null;
  carrier_legal_name: string;
  carrier_status: VerificationStatus;
  unread_messages: number;
}

/** A row of `load_offer_vehicles`. */
export interface BoardVehicle {
  vehicle_id: string;
  kind: VehicleKind;
  unit_type: UnitType | null;
  capacity_kg: number | null;
  capacity_m3: number | null;
  features: SpecialRequirement[];
  model_year: number | null;
  documents_complete: boolean;
}

/**
 * What the shipper can do with a negotiation:
 * - `respond`: the carrier's latest offer is pending (accept, counter, reject);
 * - `awaiting_carrier`: the shipper's counteroffer is pending;
 * - `accepted`: this negotiation won the load;
 * - `closed`: nothing pending (rejected, withdrawn, expired, or the load closed).
 */
export type NegotiationState = 'accepted' | 'respond' | 'awaiting_carrier' | 'closed';

export interface BoardRow {
  negotiationId: string;
  conversationId: string | null;
  carrierName: string;
  carrierStatus: VerificationStatus;
  unreadMessages: number;
  /** Offers in the order they were made. */
  offers: BoardOffer[];
  latest: BoardOffer;
  /** Unit of the carrier's most recent offer that proposed one. */
  vehicle: BoardVehicle | null;
  /** Latest amount minus the load's proposed price. */
  deltaCents: number;
  state: NegotiationState;
}

const OPEN_LOAD: readonly LoadStatus[] = ['published', 'negotiating'];

const STATE_ORDER: Record<NegotiationState, number> = {
  accepted: 0,
  respond: 1,
  awaiting_carrier: 2,
  closed: 3,
};

/** State of a negotiation for the shipper, from its latest offer. */
export function negotiationState(latest: BoardOffer, loadStatus: LoadStatus): NegotiationState {
  if (latest.status === 'accepted') return 'accepted';
  if (latest.status !== 'pending' || !OPEN_LOAD.includes(loadStatus)) return 'closed';
  // Only the counterparty answers an offer (accept_offer, counter_offer, reject_offer).
  return latest.side === 'carrier' ? 'respond' : 'awaiting_carrier';
}

const byCreation = (a: BoardOffer, b: BoardOffer) =>
  a.created_at === b.created_at
    ? a.id.localeCompare(b.id)
    : Date.parse(a.created_at) - Date.parse(b.created_at);

/**
 * One row per negotiation that has offers: the accepted one first, then those
 * waiting for the shipper, then those waiting for the carrier, then the closed
 * ones; the cheapest first within each group.
 */
export function buildOfferBoard({
  loadStatus,
  proposedPriceCents,
  carriers,
  offers,
  vehicles,
}: {
  loadStatus: LoadStatus;
  proposedPriceCents: number;
  carriers: readonly BoardCarrier[];
  offers: readonly BoardOffer[];
  vehicles: readonly BoardVehicle[];
}): BoardRow[] {
  const vehicleById = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const rows: BoardRow[] = [];
  for (const carrier of carriers) {
    const chain = offers
      .filter((o) => o.negotiation_id === carrier.negotiation_id)
      .sort(byCreation);
    const latest = chain.at(-1);
    if (!latest) continue;
    const proposedUnit = chain.findLast((o) => o.side === 'carrier' && o.vehicle_id !== null);
    rows.push({
      negotiationId: carrier.negotiation_id,
      conversationId: carrier.conversation_id,
      carrierName: carrier.carrier_legal_name,
      carrierStatus: carrier.carrier_status,
      unreadMessages: carrier.unread_messages,
      offers: chain,
      latest,
      vehicle: (proposedUnit?.vehicle_id && vehicleById.get(proposedUnit.vehicle_id)) || null,
      deltaCents: latest.amount_cents - proposedPriceCents,
      state: negotiationState(latest, loadStatus),
    });
  }
  return rows.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      a.latest.amount_cents - b.latest.amount_cents ||
      a.negotiationId.localeCompare(b.negotiationId),
  );
}

/** "+$1,000.00", "−$500.00" or `same` when equal. */
export function formatDelta(cents: number, same: string): string {
  if (cents === 0) return same;
  return `${cents > 0 ? '+' : '−'}${formatMxn(Math.abs(cents))}`;
}
