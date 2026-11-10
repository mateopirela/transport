import { describe, expect, it } from 'vitest';

import { matchesFreightFilter, parseFreightFilter, payableDirections } from './filters';

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
    const rows = [pending, overdueHeld, settled, cancelled];
    const pick = (filter: Parameters<typeof matchesFreightFilter>[1]) =>
      rows.filter((row) => matchesFreightFilter(row, filter));
    expect(pick('todos')).toHaveLength(4);
    expect(pick('vencidos')).toEqual([overdueHeld]);
    expect(pick('cliente')).toEqual([pending, overdueHeld]);
    expect(pick('transportista')).toEqual([pending, overdueHeld]);
    expect(pick('retenidos')).toEqual([overdueHeld]);
    expect(pick('revisar')).toEqual([cancelled]);
  });

  it('offers a payment only for the sides still owed', () => {
    expect(payableDirections(pending)).toEqual(['client_to_fulmis', 'fulmis_to_carrier']);
    expect(payableDirections({ client_status: 'paid', carrier_status: 'scheduled' })).toEqual([
      'fulmis_to_carrier',
    ]);
    expect(payableDirections(settled)).toEqual([]);
    expect(payableDirections(cancelled)).toEqual([]);
  });
});
