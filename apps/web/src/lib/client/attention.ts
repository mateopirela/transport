import {
  brokeredClientStage,
  type BrokeredQuoteStatus,
  type FreightClientStatus,
  type LoadStatus,
  type TripStatus,
} from '@transport/shared';

/*
 * "Requiere tu atención" of the client's start page (docs/plan-fulmis.md
 * §1.5): what waits for the client to act, one row each with its action.
 * Pure: the page reads the rows it already can (its loads, the carriers'
 * pending offers, its trips and its portfolio) and this decides what goes in
 * and in which order.
 */

/** A pending offer of a carrier on one of the client's loads. */
export interface PendingOffer {
  offerId: string;
  negotiationId: string;
  loadId: string;
  amountCents: number;
  createdAt: string;
  carrierName: string | null;
}

export interface AttentionLoad {
  id: string;
  status: LoadStatus;
  brokered: boolean;
  brokered_status: BrokeredQuoteStatus | null;
  proposed_price_cents: number | null;
  origin_city: string;
  destination_city: string;
  created_at: string;
}

export interface AttentionTrip {
  id: string;
  status: TripStatus;
  route: string | null;
}

export interface AttentionFreight {
  trip_id: string;
  status: FreightClientStatus;
  pending_cents: number;
  due_on: string | null;
  origin_city: string;
  destination_city: string;
}

export type AttentionItem =
  | {
      kind: 'offer';
      key: string;
      loadId: string;
      negotiationId: string;
      route: string;
      carrierName: string | null;
      amountCents: number;
    }
  | { kind: 'quote'; key: string; loadId: string; route: string; priceCents: number }
  | { kind: 'delivery'; key: string; tripId: string; route: string | null }
  | {
      kind: 'overdue';
      key: string;
      tripId: string;
      route: string;
      pendingCents: number;
      dueOn: string | null;
    }
  | { kind: 'draft'; key: string; loadId: string; route: string };

/** The order of the kinds: what blocks a deal first, what only waits last. */
const ORDER: Record<AttentionItem['kind'], number> = {
  offer: 0,
  quote: 1,
  delivery: 2,
  overdue: 3,
  draft: 4,
};

/** "Monterrey → Guadalajara". */
export function routeOf(place: { origin_city: string; destination_city: string }): string {
  return `${place.origin_city} → ${place.destination_city}`;
}

/** Statuses of a load whose carriers' offers wait for an answer (negotiationState). */
const OPEN: readonly LoadStatus[] = ['published', 'negotiating'];

/**
 * Everything that asks the client to act, in order: the carriers' offers
 * (newest first), the prices to approve, the deliveries to confirm, what is
 * overdue in the portfolio, and the drafts not yet published. An offer counts
 * only on an open load the client negotiates itself (a load sent to the
 * platform is negotiated by it); a trip only once delivered.
 */
export function clientAttention({
  offers,
  loads,
  trips,
  freight,
}: {
  offers: readonly PendingOffer[];
  loads: readonly AttentionLoad[];
  trips: readonly AttentionTrip[];
  freight: readonly AttentionFreight[];
}): AttentionItem[] {
  const loadById = new Map(loads.map((load) => [load.id, load]));
  // Each item with the instant it is sorted by.
  const items: { item: AttentionItem; at: string }[] = [];

  for (const offer of offers) {
    const load = loadById.get(offer.loadId);
    if (!load || load.brokered || !OPEN.includes(load.status)) continue;
    items.push({
      item: {
        kind: 'offer',
        key: `offer-${offer.offerId}`,
        loadId: load.id,
        negotiationId: offer.negotiationId,
        route: routeOf(load),
        carrierName: offer.carrierName,
        amountCents: offer.amountCents,
      },
      at: offer.createdAt,
    });
  }

  for (const load of loads) {
    if (
      brokeredClientStage(load.brokered_status, load.status) === 'quoted' &&
      load.proposed_price_cents !== null
    ) {
      items.push({
        item: {
          kind: 'quote',
          key: `quote-${load.id}`,
          loadId: load.id,
          route: routeOf(load),
          priceCents: load.proposed_price_cents,
        },
        at: load.created_at,
      });
    }
    if (load.status === 'draft' && !load.brokered) {
      items.push({
        item: { kind: 'draft', key: `draft-${load.id}`, loadId: load.id, route: routeOf(load) },
        at: load.created_at,
      });
    }
  }

  for (const trip of trips) {
    if (trip.status !== 'delivered') continue;
    items.push({
      item: { kind: 'delivery', key: `delivery-${trip.id}`, tripId: trip.id, route: trip.route },
      at: '',
    });
  }

  for (const row of freight) {
    if (row.status !== 'overdue' || row.pending_cents <= 0) continue;
    items.push({
      item: {
        kind: 'overdue',
        key: `overdue-${row.trip_id}`,
        tripId: row.trip_id,
        route: routeOf(row),
        pendingCents: row.pending_cents,
        dueOn: row.due_on,
      },
      at: row.due_on ?? '',
    });
  }

  return items
    .sort((a, b) => {
      const byKind = ORDER[a.item.kind] - ORDER[b.item.kind];
      if (byKind !== 0) return byKind;
      const byKey = a.item.key.localeCompare(b.item.key);
      // Overdue: the oldest due date first; the rest, the newest first.
      if (a.item.kind === 'overdue') return a.at.localeCompare(b.at) || byKey;
      return b.at.localeCompare(a.at) || byKey;
    })
    .map(({ item }) => item);
}
