import { operatorDraftSchema, vehicleFormSchema } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import {
  operatorFormValues,
  operatorSchemaInput,
  parseFleetFlash,
  parseNumberInput,
  vehicleFormValues,
  vehicleSchemaInput,
} from './fleet-forms';

describe('parseNumberInput', () => {
  it('reads numbers typed with separators and rejects garbage', () => {
    expect(parseNumberInput('28,000')).toBe(28000);
    expect(parseNumberInput(' 85.5 ')).toBe(85.5);
    expect(parseNumberInput('')).toBeUndefined();
    expect(parseNumberInput(undefined)).toBeUndefined();
    expect(parseNumberInput('abc')).toBeNaN();
  });
});

describe('vehicleSchemaInput', () => {
  it('builds a trailer the schema accepts', () => {
    const parsed = vehicleFormSchema.safeParse(
      vehicleSchemaInput(
        {
          kind: 'trailer',
          plate: 'ab-123 cd',
          fleetNumber: 'CS53-02',
          modelYear: '2021',
          unitType: 'dry_van',
          capacityKg: '28,000',
          capacityM3: '85',
        },
        ['tarp'],
      ),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      kind: 'trailer',
      plate: 'AB123CD',
      capacityKg: 28000,
      features: ['tarp'],
    });
  });

  it('drops the body, capacity and features of a tractor', () => {
    const input = vehicleSchemaInput(
      { kind: 'tractor', plate: 'XY1234', unitType: 'dry_van', capacityKg: '1' },
      ['tarp'],
    );
    expect(input.unitType).toBeUndefined();
    expect(input.capacityKg).toBeUndefined();
    expect(input.features).toEqual([]);
    expect(vehicleFormSchema.safeParse(input).success).toBe(true);
  });

  it('reports a missing capacity on a rigid truck', () => {
    const parsed = vehicleFormSchema.safeParse(
      vehicleSchemaInput({ kind: 'rigid', plate: 'XY1234', unitType: 'torton' }, []),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('capacityKg');
  });
});

describe('vehicleFormValues', () => {
  it('turns a row into the form values, blank when null', () => {
    expect(
      vehicleFormValues({
        kind: 'rigid',
        plate: '25AP8K',
        fleet_number: null,
        model_year: 2019,
        unit_type: 'torton',
        capacity_kg: 14000,
        capacity_m3: null,
      }),
    ).toEqual({
      kind: 'rigid',
      plate: '25AP8K',
      fleetNumber: '',
      modelYear: '2019',
      unitType: 'torton',
      capacityKg: '14000',
      capacityM3: '',
    });
  });
});

describe('operator form', () => {
  it('round-trips a row through the draft schema', () => {
    const values = operatorFormValues({
      full_name: 'Pedro López',
      email: 'pedro@demo.test',
      phone: null,
      license_number: 'nl 123',
      license_type: 'E',
      license_expires_on: '2099-01-01',
    });
    expect(values.phone).toBe('');
    const parsed = operatorDraftSchema.safeParse(operatorSchemaInput(values));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ licenseNumber: 'NL123', licenseType: 'E' });
  });

  it('leaves the optional license fields out when blank', () => {
    const cases: Record<string, string>[] = [
      { fullName: 'Ana', email: 'ana@demo.test', licenseType: '' },
      { fullName: 'Ana', email: 'ana@demo.test' },
    ];
    for (const entries of cases) {
      const parsed = operatorDraftSchema.safeParse(operatorSchemaInput(entries));
      expect(parsed.success).toBe(true);
      expect(parsed.data?.licenseType).toBeUndefined();
    }
  });
});

describe('parseFleetFlash', () => {
  it('reads the add and archive flashes', () => {
    expect(parseFleetFlash('alta')).toBe('alta');
    expect(parseFleetFlash('baja')).toBe('baja');
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseFleetFlash(['baja', 'alta'])).toBe('baja');
    expect(parseFleetFlash(['otro', 'alta'])).toBeNull();
  });

  it('ignores missing and unsupported values', () => {
    expect(parseFleetFlash(undefined)).toBeNull();
    expect(parseFleetFlash([])).toBeNull();
    expect(parseFleetFlash('')).toBeNull();
    expect(parseFleetFlash('ALTA')).toBeNull();
    expect(parseFleetFlash('<script>')).toBeNull();
  });
});
