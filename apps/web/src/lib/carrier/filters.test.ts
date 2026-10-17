import { describe, expect, it } from 'vitest';

import { hasLoadFilters, loadFilterParams, parseLoadFilters } from './filters';

describe('parseLoadFilters', () => {
  it('reads city presets and the unit type from the query', () => {
    const filters = parseLoadFilters({ origen: 'gdl', destino: 'mty', unidad: 'dry_van' });
    expect(filters.origin?.city).toBe('Guadalajara');
    expect(filters.destination?.city).toBe('Monterrey');
    expect(filters.unitType).toBe('dry_van');
    expect(hasLoadFilters(filters)).toBe(true);
  });

  it('drops unknown or repeated values', () => {
    const filters = parseLoadFilters({
      origen: 'paris',
      destino: ['mty', 'gdl'],
      unidad: 'spaceship',
    });
    expect(filters.origin).toBeUndefined();
    expect(filters.destination?.id).toBe('mty');
    expect(filters.unitType).toBeUndefined();
    expect(hasLoadFilters(parseLoadFilters({}))).toBe(false);
  });

  it('round-trips through the query parameters', () => {
    const filters = parseLoadFilters({ origen: 'mty', unidad: 'refrigerated' });
    expect(loadFilterParams(filters)).toEqual({
      origen: 'mty',
      destino: undefined,
      unidad: 'refrigerated',
    });
  });
});
