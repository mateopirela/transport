import { describe, expect, it } from 'vitest';

import {
  cityFilter,
  cleanSearch,
  formatRoute,
  parseIncidentFilters,
  parseLoadFilters,
  parseTripFilters,
} from './filters';

describe('cleanSearch', () => {
  it('keeps letters with accents, digits and spaces', () => {
    expect(cleanSearch('  San Pedro   Garza García ')).toBe('San Pedro Garza García');
    expect(cleanSearch(['Monterrey', 'x'])).toBe('Monterrey');
  });

  it('drops characters that could break a PostgREST or-filter or act as wildcards', () => {
    expect(cleanSearch('a,b)(c*d%e\\f"g')).toBe('a b c d e f g');
    expect(cleanSearch('x),status.eq.draft')).toBe('x status.eq.draft');
    expect(cityFilter(cleanSearch('x),id.eq.1'))).toBe(
      'origin_city.ilike.*x id.eq.1*,destination_city.ilike.*x id.eq.1*',
    );
  });

  it('is empty when missing and caps the length', () => {
    expect(cleanSearch(undefined)).toBe('');
    expect(cleanSearch('a'.repeat(100))).toHaveLength(60);
  });
});

describe('parseLoadFilters', () => {
  it('accepts known statuses only', () => {
    expect(parseLoadFilters({ estado: 'negotiating', ciudad: 'Monterrey', p: '2' })).toEqual({
      status: 'negotiating',
      city: 'Monterrey',
      page: 2,
    });
    expect(parseLoadFilters({ estado: 'hacked' })).toEqual({
      status: undefined,
      city: '',
      page: 1,
    });
  });
});

describe('parseTripFilters', () => {
  it('accepts known trip statuses only', () => {
    expect(parseTripFilters({ estado: 'in_transit' })).toEqual({ status: 'in_transit', page: 1 });
    expect(parseTripFilters({ estado: 'published' }).status).toBeUndefined();
  });
});

describe('parseIncidentFilters', () => {
  it('defaults to open incidents', () => {
    expect(parseIncidentFilters({})).toEqual({ status: 'open', page: 1 });
    expect(parseIncidentFilters({ estado: 'resolved', p: '3' })).toEqual({
      status: 'resolved',
      page: 3,
    });
    expect(parseIncidentFilters({ estado: 'x' }).status).toBe('open');
  });
});

describe('formatRoute', () => {
  it('joins origin and destination', () => {
    expect(
      formatRoute({
        origin_city: 'Monterrey',
        origin_state: 'Nuevo León',
        destination_city: 'Guadalajara',
        destination_state: 'Jalisco',
      }),
    ).toBe('Monterrey, Nuevo León → Guadalajara, Jalisco');
  });
});
