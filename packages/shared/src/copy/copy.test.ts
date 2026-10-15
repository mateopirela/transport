import { describe, expect, it } from 'vitest';

import { UNIT_TYPES } from '../enums';
import * as catalogs from './catalogs';
import { toOptions, unitTypeLabels } from './catalogs';

describe('catalog labels', () => {
  it('has a non-empty Spanish label for every value', () => {
    const records = Object.entries(catalogs).filter(([name]) => name.endsWith('Labels'));
    expect(records.length).toBeGreaterThan(10);
    for (const [, labels] of records) {
      for (const label of Object.values(labels as Record<string, string>)) {
        expect(label.trim()).not.toBe('');
      }
    }
  });

  it('includes the unit types from the plan', () => {
    const labels = Object.values(unitTypeLabels);
    for (const expected of ['Caja seca', 'Plataforma', 'Tolva', 'Redilas', 'Camioneta 3.5 t']) {
      expect(labels).toContain(expected);
    }
  });

  it('builds select options in enum order', () => {
    const options = toOptions(UNIT_TYPES, unitTypeLabels);
    expect(options).toHaveLength(UNIT_TYPES.length);
    expect(options[0]).toEqual({ value: 'dry_van', label: 'Caja seca' });
  });
});
