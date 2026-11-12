import { carrierWebCopy, vehicleReleaseCopy, type NegotiationOffer } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { attentionItems, negotiationsToAnswer, type NegotiationToAnswer } from './carrier-home';
import type { CarrierLoad, CarrierNegotiationSummary } from './loads-api';

const d = carrierWebCopy.dashboard.attention;

function load(id: string, status: CarrierLoad['status'] = 'negotiating'): CarrierLoad {
  return {
    id,
    status,
    origin_city: 'Zapopan',
    origin_state: 'Jalisco',
    origin_lat: 20.7,
    origin_lng: -103.4,
    destination_city: 'Monterrey',
    destination_state: 'Nuevo León',
    destination_lat: 25.7,
    destination_lng: -100.3,
    pickup_window_start: '2026-11-13T14:00:00Z',
    pickup_window_end: '2026-11-13T18:00:00Z',
    delivery_window_start: '2026-11-14T14:00:00Z',
    delivery_window_end: '2026-11-14T18:00:00Z',
    cargo_type: 'general',
    description: 'Tarimas',
    weight_kg: 12000,
    volume_m3: null,
    unit_type: 'dry_van',
    special_requirements: [],
    proposed_price_cents: 3_000_000,
    notes: null,
    brokered: false,
  };
}

function offer(
  id: string,
  side: NegotiationOffer['side'],
  status: NegotiationOffer['status'],
  createdAt: string,
  amount = 2_800_000,
): NegotiationOffer {
  return {
    id,
    side,
    amount_cents: amount,
    conditions: null,
    vehicle_id: null,
    status,
    status_reason: null,
    created_at: createdAt,
  };
}

describe('negotiationsToAnswer', () => {
  it('keeps only the counteroffers that wait for the carrier, with their amount', () => {
    const negotiations: CarrierNegotiationSummary[] = [
      {
        negotiationId: 'n1',
        load: load('l1'),
        offers: [
          offer('o1', 'carrier', 'countered', '2026-11-12T10:00:00Z'),
          offer('o2', 'shipper', 'pending', '2026-11-12T11:00:00Z', 2_650_050),
        ],
      },
      // Waiting for the client.
      {
        negotiationId: 'n2',
        load: load('l2'),
        offers: [offer('o3', 'carrier', 'pending', '2026-11-12T10:00:00Z')],
      },
      // Won by another carrier: the load is hidden.
      {
        negotiationId: 'n3',
        load: null,
        offers: [offer('o4', 'shipper', 'pending', '2026-11-12T10:00:00Z')],
      },
    ];
    expect(negotiationsToAnswer(negotiations)).toEqual([
      {
        negotiationId: 'n1',
        loadId: 'l1',
        route: 'Zapopan → Monterrey',
        amountCents: 2_650_050,
      },
    ]);
  });

  it('never asks to answer on a load that no longer takes offers', () => {
    const negotiations: CarrierNegotiationSummary[] = [
      {
        negotiationId: 'n1',
        load: load('l1', 'contracted'),
        offers: [offer('o1', 'shipper', 'pending', '2026-11-12T10:00:00Z')],
      },
    ];
    expect(negotiationsToAnswer(negotiations)).toEqual([]);
  });
});

describe('attentionItems', () => {
  const toAnswer: NegotiationToAnswer[] = ['a', 'b', 'c', 'e'].map((id) => ({
    negotiationId: id,
    loadId: `load-${id}`,
    route: 'Zapopan → Monterrey',
    amountCents: 2_800_000,
  }));

  it('puts the releases first, then counteroffers, trips and documents, each to its screen', () => {
    const { items, total, more } = attentionItems({
      releases: [{ taskId: 't1', vehicleId: 'v1', unit: 'TT-01', route: 'Monterrey → Apodaca' }],
      toAnswer: toAnswer.slice(0, 1),
      toAssign: [
        {
          id: 'trip-1',
          pickupAt: '2026-11-13T14:00:00Z',
          load: { origin_city: 'Guadalajara', destination_city: 'Monterrey' },
        },
      ],
      expiring: [
        {
          documentId: 'doc-1',
          requirementName: 'Póliza de seguro',
          owner: { type: 'operator', id: 'op-1', label: 'Pedro López' },
          expiresAt: '2026-11-20T06:00:00Z',
          daysLeft: 8,
        },
      ],
    });
    expect(items.map((item) => [item.tag, item.tone, item.target])).toEqual([
      [d.tags.release, 'problem', { screen: 'vehicle', id: 'v1' }],
      [d.tags.respond, 'attention', { screen: 'load', id: 'load-a' }],
      [d.tags.assign, 'pending', { screen: 'trip', id: 'trip-1' }],
      [d.tags.expiring, 'pending', { screen: 'operator', id: 'op-1' }],
    ]);
    expect(items[0]?.title).toBe(vehicleReleaseCopy.home.item('TT-01', 'Monterrey → Apodaca'));
    expect(items[1]?.detail).toBe(d.respondDetail('$28,000'));
    expect(items[2]?.title).toBe('Guadalajara → Monterrey');
    expect(items[3]?.title).toBe('Póliza de seguro · Pedro López');
    expect(items[3]?.detail).toBe('Vence en 8 días');
    expect(total).toBe(4);
    expect(more).toEqual({ respond: 0, assign: 0, expiring: 0 });
  });

  it('shows a few rows of each kind and counts the rest', () => {
    const { items, total, more } = attentionItems(
      { releases: [], toAnswer, toAssign: [], expiring: [] },
      { perKind: 3 },
    );
    expect(items).toHaveLength(3);
    expect(total).toBe(4);
    expect(more.respond).toBe(1);
  });

  it('unfolds every expiring document when asked to', () => {
    const expiring = ['a', 'b', 'c', 'e', 'f'].map((id, i) => ({
      documentId: id,
      requirementName: 'Póliza de seguro',
      owner: { type: 'vehicle' as const, id: `v-${id}`, label: `CS53-0${i}` },
      expiresAt: '2026-11-20T06:00:00Z',
      daysLeft: 8,
    }));
    const input = { releases: [], toAnswer: [], toAssign: [], expiring };
    expect(attentionItems(input).more.expiring).toBe(2);
    const all = attentionItems(input, { allExpiring: true });
    expect(all.items).toHaveLength(5);
    expect(all.more.expiring).toBe(0);
  });

  it('is empty when nothing waits', () => {
    expect(attentionItems({ releases: [], toAnswer: [], toAssign: [], expiring: [] })).toEqual({
      items: [],
      total: 0,
      more: { respond: 0, assign: 0, expiring: 0 },
    });
  });
});
