import { describe, expect, it } from 'vitest';

import {
  carrierWaitsForClient,
  matchesFreightFilter,
  parseFreightFilter,
  payableDirections,
} from './filters';

const pending = {
  client_status: 'pending',
  carrier_status: 'pending',
  needs_review: false,
} as const;
const overdueHeld = {
  client_status: 'overdue',
  carrier_status: 'on_hold',
  needs_review: false,
} as const;
const settled = { client_status: 'paid', carrier_status: 'paid', needs_review: false } as const;
const quickPay = {
  client_status: 'invoiced',
  carrier_status: 'quick_pay_requested',
  needs_review: false,
} as const;
const cancelled = {
  client_status: 'cancelled',
  carrier_status: 'cancelled',
  needs_review: true,
} as const;

describe('freight filters', () => {
  it('falls back to every trip', () => {
    expect(parseFreightFilter('vencidos')).toBe('vencidos');
    expect(parseFreightFilter('nada')).toBe('todos');
    expect(parseFreightFilter(undefined)).toBe('todos');
  });

  it('filters by side and status', () => {
    const rows = [pending, overdueHeld, settled, quickPay, cancelled];
    const pick = (filter: Parameters<typeof matchesFreightFilter>[1]) =>
      rows.filter((row) => matchesFreightFilter(row, filter));
    expect(pick('todos')).toHaveLength(5);
    expect(pick('vencidos')).toEqual([overdueHeld]);
    expect(pick('cliente')).toEqual([pending, overdueHeld, quickPay]);
    expect(pick('transportista')).toEqual([pending, overdueHeld, quickPay]);
    expect(pick('retenidos')).toEqual([overdueHeld]);
    expect(pick('rapido')).toEqual([quickPay]);
    expect(pick('revisar')).toEqual([cancelled]);
  });

  it('offers a payment only for the sides still owed', () => {
    // D33-E1: not the carrier while the client has not paid in full.
    expect(payableDirections(pending)).toEqual(['client_to_fulmis']);
    expect(payableDirections(overdueHeld)).toEqual(['client_to_fulmis']);
    expect(payableDirections({ client_status: 'paid', carrier_status: 'scheduled' })).toEqual([
      'fulmis_to_carrier',
    ]);
    expect(payableDirections(settled)).toEqual([]);
    // I4: not the carrier while its quick pay request waits for the admin.
    expect(payableDirections(quickPay)).toEqual(['client_to_fulmis']);
    expect(payableDirections(cancelled)).toEqual([]);
    // D38: an approved quick pay is paid before the client.
    expect(
      payableDirections({
        client_status: 'invoiced',
        carrier_status: 'scheduled',
        quick_pay_approved_at: '2026-11-10T18:00:00Z',
      }),
    ).toEqual(['client_to_fulmis', 'fulmis_to_carrier']);
    expect(
      payableDirections({
        client_status: 'pending',
        carrier_status: 'pending',
        quick_pay_approved_at: null,
      }),
    ).toEqual(['client_to_fulmis']);
  });

  it('says when the carrier waits for the client (D33-E1)', () => {
    expect(carrierWaitsForClient(pending)).toBe(true);
    expect(carrierWaitsForClient(overdueHeld)).toBe(true);
    expect(carrierWaitsForClient({ client_status: 'paid', carrier_status: 'scheduled' })).toBe(
      false,
    );
    expect(carrierWaitsForClient(settled)).toBe(false);
    expect(carrierWaitsForClient(quickPay)).toBe(false);
    expect(carrierWaitsForClient(cancelled)).toBe(false);
  });
});
