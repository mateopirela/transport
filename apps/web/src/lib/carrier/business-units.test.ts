import { describe, expect, it } from 'vitest';

import {
  ALL_BUSINESS_UNITS,
  parseBusinessUnitChoice,
  resolveBusinessUnitSelection,
} from './business-units';

const CORRIDOR = { id: '00000000-0000-4000-8000-000000000001', name: 'Corredor MTY–GDL' };
const REGIONAL = { id: '00000000-0000-4000-8000-000000000002', name: 'Regional Monterrey' };

describe('resolveBusinessUnitSelection', () => {
  it('shows every operable unit without a cookie, sorted by name', () => {
    const selection = resolveBusinessUnitSelection([REGIONAL, CORRIDOR], undefined);
    expect(selection.operable.map((u) => u.name)).toEqual([CORRIDOR.name, REGIONAL.name]);
    expect(selection.selected).toBeNull();
    expect(selection.ids).toEqual([CORRIDOR.id, REGIONAL.id]);
  });

  it('narrows to the unit in the cookie when the viewer still operates it', () => {
    const selection = resolveBusinessUnitSelection([CORRIDOR, REGIONAL], REGIONAL.id);
    expect(selection.selected).toEqual(REGIONAL);
    expect(selection.ids).toEqual([REGIONAL.id]);
  });

  it('ignores a stale cookie or an explicit "all"', () => {
    const stale = resolveBusinessUnitSelection([CORRIDOR], REGIONAL.id);
    // One operable unit is always selected: a Coordinador of one unit has no picker.
    expect(stale.selected).toEqual(CORRIDOR);
    const all = resolveBusinessUnitSelection([CORRIDOR, REGIONAL], ALL_BUSINESS_UNITS);
    expect(all.selected).toBeNull();
    expect(all.ids).toHaveLength(2);
  });

  it('leaves a Coordinador without units with nothing to show', () => {
    const selection = resolveBusinessUnitSelection([], CORRIDOR.id);
    expect(selection.selected).toBeNull();
    expect(selection.ids).toEqual([]);
  });
});

describe('parseBusinessUnitChoice', () => {
  it('accepts "all" or a uuid and rejects anything else', () => {
    expect(parseBusinessUnitChoice(ALL_BUSINESS_UNITS)).toBe(ALL_BUSINESS_UNITS);
    expect(parseBusinessUnitChoice(CORRIDOR.id)).toBe(CORRIDOR.id);
    expect(parseBusinessUnitChoice('../admin')).toBeNull();
    expect(parseBusinessUnitChoice(null)).toBeNull();
  });
});
