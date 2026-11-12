import { describe, expect, it } from 'vitest';

import {
  ATTENTION_ORDER,
  ATTENTION_TONES,
  brokeredAttention,
  freightAttention,
  orderAttention,
  paymentsToRegister,
  type BrokeredRow,
  type LedgerRow,
} from './dashboard';

const row = (overrides: Partial<LedgerRow>): LedgerRow => ({
  trip_id: 'trip',
  origin_city: 'Monterrey',
  destination_city: 'Guadalajara',
  shipper_name: 'Cliente',
  carrier_name: 'Transportista',
  client_status: 'pending',
  carrier_status: 'pending',
  client_due_on: null,
  needs_review: false,
  quick_pay_approved_at: null,
  ...overrides,
});

const brokered = (overrides: Partial<BrokeredRow>): BrokeredRow => ({
  load_id: 'load',
  quote_status: 'requested',
  load_status: 'draft',
  origin_city: 'Monterrey',
  destination_city: 'Guadalajara',
  pending_offers: 0,
  ...overrides,
});

describe('freightAttention', () => {
  it('keeps a trip to review out of every other list', () => {
    const review = row({ trip_id: 'r', needs_review: true, client_status: 'overdue' });
    const result = freightAttention([review]);
    expect(result.review).toEqual([review]);
    expect(result.overdue).toEqual([]);
  });

  it('lists the quick pay requests and the overdue charges', () => {
    const quick = row({ trip_id: 'q', carrier_status: 'quick_pay_requested' });
    const overdue = row({ trip_id: 'o', client_status: 'overdue' });
    const result = freightAttention([quick, overdue, row({ trip_id: 'n' })]);
    expect(result.quickPay.map((r) => r.trip_id)).toEqual(['q']);
    expect(result.overdue.map((r) => r.trip_id)).toEqual(['o']);
  });

  it('owes the carrier once the client paid or a quick pay was approved (D33-E1, D38)', () => {
    const paid = row({ trip_id: 'p', client_status: 'paid' });
    const approved = row({ trip_id: 'a', quick_pay_approved_at: '2026-11-01T00:00:00Z' });
    const waiting = row({ trip_id: 'w' });
    const settled = row({ trip_id: 's', client_status: 'paid', carrier_status: 'paid' });
    const result = freightAttention([paid, approved, waiting, settled]);
    expect(result.carrierPayable.map((r) => r.trip_id)).toEqual(['p', 'a']);
  });

  it('counts the payments to register: overdue charges and carriers to pay', () => {
    const result = freightAttention([
      row({ trip_id: '1', client_status: 'overdue' }),
      row({ trip_id: '2', client_status: 'paid' }),
      row({ trip_id: '3' }),
    ]);
    expect(paymentsToRegister(result)).toBe(2);
  });
});

describe('brokeredAttention', () => {
  it('asks for a quote while requested, and for an answer while offers wait', () => {
    const toQuote = brokered({ load_id: 't' });
    const withOffers = brokered({
      load_id: 'o',
      quote_status: 'approved',
      load_status: 'published',
      pending_offers: 2,
    });
    const quiet = brokered({ load_id: 'q', quote_status: 'approved', load_status: 'published' });
    const result = brokeredAttention([toQuote, withOffers, quiet]);
    expect(result.toQuote.map((r) => r.load_id)).toEqual(['t']);
    expect(result.withOffers.map((r) => r.load_id)).toEqual(['o']);
  });
});

describe('orderAttention', () => {
  it('puts money and trips before accounts, keeping the order within a kind', () => {
    const items = [
      { kind: 'document', key: 'd1' },
      { kind: 'company', key: 'c1' },
      { kind: 'incident', key: 'i1' },
      { kind: 'review', key: 'r1' },
      { kind: 'incident', key: 'i2' },
    ] as const;
    const { shown, hidden } = orderAttention(items, 4);
    expect(shown.map((item) => item.key)).toEqual(['r1', 'i1', 'i2', 'c1']);
    expect(hidden).toBe(1);
  });

  it('gives every kind a place and a tone', () => {
    expect(new Set(ATTENTION_ORDER).size).toBe(ATTENTION_ORDER.length);
    for (const kind of ATTENTION_ORDER) expect(ATTENTION_TONES[kind]).toBeDefined();
  });
});
