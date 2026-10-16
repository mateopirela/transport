import { describe, expect, it } from 'vitest';

import { buildOfferBoard, formatDelta, negotiationState, type BoardOffer } from './board';

const N1 = '00000000-0000-4000-8000-000000000001';
const N2 = '00000000-0000-4000-8000-000000000002';
const N3 = '00000000-0000-4000-8000-000000000003';
const V1 = '00000000-0000-4000-8000-0000000000a1';

function offer(over: Partial<BoardOffer> & Pick<BoardOffer, 'id' | 'negotiation_id'>): BoardOffer {
  return {
    side: 'carrier',
    amount_cents: 3_400_000,
    conditions: null,
    vehicle_id: null,
    status: 'pending',
    status_reason: null,
    created_at: '2026-10-15T10:00:00.000000+00:00',
    ...over,
  };
}

const carrier = (negotiation_id: string, name: string) => ({
  negotiation_id,
  conversation_id: null,
  carrier_legal_name: name,
  carrier_status: 'approved' as const,
  unread_messages: 0,
});

const vehicle = {
  vehicle_id: V1,
  kind: 'rigid' as const,
  unit_type: 'dry_van' as const,
  capacity_kg: 30000,
  capacity_m3: null,
  features: [],
  model_year: 2022,
  documents_complete: true,
};

describe('negotiationState', () => {
  it('lets the shipper answer a pending carrier offer while the load is open', () => {
    expect(negotiationState(offer({ id: 'a', negotiation_id: N1 }), 'negotiating')).toBe('respond');
  });

  it('waits for the carrier after a counteroffer', () => {
    expect(
      negotiationState(offer({ id: 'a', negotiation_id: N1, side: 'shipper' }), 'negotiating'),
    ).toBe('awaiting_carrier');
  });

  it('closes everything once the load is no longer open', () => {
    expect(negotiationState(offer({ id: 'a', negotiation_id: N1 }), 'cancelled')).toBe('closed');
    expect(
      negotiationState(offer({ id: 'a', negotiation_id: N1, status: 'rejected' }), 'published'),
    ).toBe('closed');
  });

  it('marks the accepted negotiation', () => {
    expect(
      negotiationState(offer({ id: 'a', negotiation_id: N1, status: 'accepted' }), 'contracted'),
    ).toBe('accepted');
  });
});

describe('buildOfferBoard', () => {
  it('builds one row per negotiation with its latest offer and proposed unit', () => {
    const rows = buildOfferBoard({
      loadStatus: 'negotiating',
      proposedPriceCents: 3_500_000,
      carriers: [carrier(N1, 'Fletes Alfa')],
      offers: [
        offer({
          id: 'c',
          negotiation_id: N1,
          side: 'carrier',
          amount_cents: 3_450_000,
          created_at: '2026-10-15T12:00:00.000000+00:00',
        }),
        offer({
          id: 'a',
          negotiation_id: N1,
          vehicle_id: V1,
          status: 'countered',
          created_at: '2026-10-15T10:00:00.000000+00:00',
        }),
        offer({
          id: 'b',
          negotiation_id: N1,
          side: 'shipper',
          amount_cents: 3_300_000,
          status: 'countered',
          created_at: '2026-10-15T11:00:00.000000+00:00',
        }),
      ],
      vehicles: [vehicle],
    });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.offers.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(row?.latest.id).toBe('c');
    // The latest carrier offer proposed no unit: the earlier one is shown.
    expect(row?.vehicle).toEqual(vehicle);
    expect(row?.deltaCents).toBe(-50_000);
    expect(row?.state).toBe('respond');
  });

  it('orders accepted, then waiting for the shipper, then the carrier, then closed; cheapest first', () => {
    const rows = buildOfferBoard({
      loadStatus: 'negotiating',
      proposedPriceCents: 3_500_000,
      carriers: [carrier(N1, 'A'), carrier(N2, 'B'), carrier(N3, 'C')],
      offers: [
        offer({ id: '1', negotiation_id: N1, amount_cents: 3_600_000 }),
        offer({ id: '2', negotiation_id: N2, amount_cents: 3_200_000, status: 'rejected' }),
        offer({ id: '3', negotiation_id: N3, amount_cents: 3_400_000 }),
      ],
      vehicles: [],
    });
    expect(rows.map((r) => r.carrierName)).toEqual(['C', 'A', 'B']);
    expect(rows[0]?.vehicle).toBeNull();
  });

  it('skips negotiations without visible offers', () => {
    const rows = buildOfferBoard({
      loadStatus: 'published',
      proposedPriceCents: 1,
      carriers: [carrier(N1, 'A')],
      offers: [],
      vehicles: [],
    });
    expect(rows).toEqual([]);
  });
});

describe('formatDelta', () => {
  it('signs the difference against the proposed price', () => {
    expect(formatDelta(100_000, 'Igual')).toBe('+$1,000.00');
    expect(formatDelta(-50_050, 'Igual')).toBe('−$500.50');
    expect(formatDelta(0, 'Igual')).toBe('Igual');
  });
});
