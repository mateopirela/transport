import { describe, expect, it } from 'vitest';

import {
  clientAttention,
  routeOf,
  type AttentionFreight,
  type AttentionLoad,
  type AttentionTrip,
  type PendingOffer,
} from './attention';

function load(id: string, overrides: Partial<AttentionLoad> = {}): AttentionLoad {
  return {
    id,
    status: 'published',
    brokered: false,
    brokered_status: null,
    proposed_price_cents: 4_000_000,
    origin_city: 'Monterrey',
    destination_city: 'Guadalajara',
    created_at: '2026-11-01T12:00:00+00:00',
    ...overrides,
  };
}

function offer(id: string, loadId: string, createdAt: string): PendingOffer {
  return {
    offerId: id,
    negotiationId: `n-${id}`,
    loadId,
    amountCents: 3_850_000,
    createdAt,
    carrierName: 'Transportes Regios',
  };
}

const none = { offers: [], loads: [], trips: [], freight: [] };

describe('clientAttention', () => {
  it('is empty when nothing waits for the client', () => {
    expect(clientAttention(none)).toEqual([]);
    expect(
      clientAttention({
        ...none,
        loads: [load('l1', { status: 'contracted' })],
        trips: [{ id: 't1', status: 'in_transit', route: 'A → B' }],
      }),
    ).toEqual([]);
  });

  it('lists the carriers’ pending offers on open loads, newest first', () => {
    const items = clientAttention({
      ...none,
      loads: [load('l1', { status: 'negotiating' }), load('l2', { status: 'negotiating' })],
      offers: [
        offer('o1', 'l1', '2026-11-02T10:00:00+00:00'),
        offer('o2', 'l2', '2026-11-03T10:00:00+00:00'),
      ],
    });
    expect(items.map((item) => item.key)).toEqual(['offer-o2', 'offer-o1']);
    expect(items[0]).toMatchObject({
      kind: 'offer',
      loadId: 'l2',
      negotiationId: 'n-o2',
      route: 'Monterrey → Guadalajara',
      carrierName: 'Transportes Regios',
      amountCents: 3_850_000,
    });
  });

  it('leaves out offers of closed, unknown or brokered loads', () => {
    const items = clientAttention({
      ...none,
      loads: [load('closed', { status: 'contracted' }), load('broker', { brokered: true })],
      offers: [
        offer('o1', 'closed', '2026-11-02T10:00:00+00:00'),
        offer('o2', 'broker', '2026-11-02T10:00:00+00:00'),
        offer('o3', 'missing', '2026-11-02T10:00:00+00:00'),
      ],
    });
    expect(items).toEqual([]);
  });

  it('asks to approve a quoted price and to publish a draft', () => {
    const items = clientAttention({
      ...none,
      loads: [
        load('quoted', {
          brokered: true,
          status: 'draft',
          brokered_status: 'quoted',
          proposed_price_cents: 1_200_000,
        }),
        load('requested', {
          brokered: true,
          status: 'draft',
          brokered_status: 'requested',
          proposed_price_cents: null,
        }),
        load('draft', { status: 'draft' }),
      ],
    });
    expect(items.map((item) => item.key)).toEqual(['quote-quoted', 'draft-draft']);
    expect(items[0]).toMatchObject({ kind: 'quote', priceCents: 1_200_000 });
  });

  it('asks to confirm a delivered trip', () => {
    const trips: AttentionTrip[] = [
      { id: 't1', status: 'delivered', route: 'Monterrey → Guadalajara' },
      { id: 't2', status: 'unloading', route: 'Monterrey → Guadalajara' },
    ];
    expect(clientAttention({ ...none, trips })).toEqual([
      { kind: 'delivery', key: 'delivery-t1', tripId: 't1', route: 'Monterrey → Guadalajara' },
    ]);
  });

  it('lists what is overdue, the oldest due date first', () => {
    const row = (trip: string, dueOn: string, overrides: Partial<AttentionFreight> = {}) => ({
      trip_id: trip,
      status: 'overdue' as const,
      pending_cents: 4_000_000,
      due_on: dueOn,
      origin_city: 'Monterrey',
      destination_city: 'Saltillo',
      ...overrides,
    });
    const items = clientAttention({
      ...none,
      freight: [
        row('late', '2026-10-20'),
        row('later', '2026-10-01'),
        row('paid', '2026-09-01', { status: 'paid' }),
        row('zero', '2026-09-01', { pending_cents: 0 }),
      ],
    });
    expect(items.map((item) => item.key)).toEqual(['overdue-later', 'overdue-late']);
    expect(items[0]).toMatchObject({ route: 'Monterrey → Saltillo', dueOn: '2026-10-01' });
  });

  it('orders the kinds: offers, prices, deliveries, overdue, drafts', () => {
    const items = clientAttention({
      loads: [
        load('draft', { status: 'draft' }),
        load('open', { status: 'negotiating' }),
        load('quoted', {
          brokered: true,
          status: 'draft',
          brokered_status: 'quoted',
          proposed_price_cents: 1_200_000,
        }),
      ],
      offers: [offer('o1', 'open', '2026-11-02T10:00:00+00:00')],
      trips: [{ id: 't1', status: 'delivered', route: null }],
      freight: [
        {
          trip_id: 't9',
          status: 'overdue',
          pending_cents: 100,
          due_on: '2026-10-01',
          origin_city: 'A',
          destination_city: 'B',
        },
      ],
    });
    expect(items.map((item) => item.kind)).toEqual([
      'offer',
      'quote',
      'delivery',
      'overdue',
      'draft',
    ]);
  });
});

describe('routeOf', () => {
  it('joins the cities with an arrow', () => {
    expect(routeOf({ origin_city: 'León', destination_city: 'Apodaca' })).toBe('León → Apodaca');
  });
});
