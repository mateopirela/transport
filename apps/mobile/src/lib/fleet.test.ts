import { fleetErrorCopy, mobileErrorCopy, vehicleFormSchema } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { fleetErrorMessage } from './fleet-errors';
import {
  EMPTY_VEHICLE_FORM,
  parseNumberInput,
  photoResize,
  toggleItem,
  vehicleColumns,
  vehicleFormFromRow,
  vehicleSchemaInput,
} from './fleet-forms';
import { validateForm } from './forms';

describe('parseNumberInput', () => {
  it('reads blanks as undefined, thousands separators and decimals', () => {
    expect(parseNumberInput('  ')).toBeUndefined();
    expect(parseNumberInput('30,000')).toBe(30000);
    expect(parseNumberInput('72.5')).toBe(72.5);
  });

  it('turns garbage into NaN so the schema rejects it', () => {
    expect(parseNumberInput('12a')).toBeNaN();
    expect(parseNumberInput('-5')).toBeNaN();
  });
});

describe('vehicle form', () => {
  it('validates a trailer and maps it to columns', () => {
    const parsed = validateForm(
      vehicleFormSchema,
      vehicleSchemaInput({
        ...EMPTY_VEHICLE_FORM,
        plate: 'abc-12-34',
        unitType: 'dry_van',
        capacityKg: '30,000',
        features: ['tarp'],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(vehicleColumns(parsed.data)).toEqual({
      plate: 'ABC1234',
      fleet_number: null,
      model_year: null,
      unit_type: 'dry_van',
      capacity_kg: 30000,
      capacity_m3: null,
      features: ['tarp'],
    });
  });

  it('drops body and capacity typed before switching to a tractor', () => {
    const input = vehicleSchemaInput({
      ...EMPTY_VEHICLE_FORM,
      kind: 'tractor',
      plate: 'TRC1234',
      unitType: 'dry_van',
      capacityKg: '30000',
    });
    expect(input).toMatchObject({ unitType: undefined, capacityKg: undefined });
    expect(validateForm(vehicleFormSchema, input).ok).toBe(true);
  });

  it('reports missing capacity on a rigid truck', () => {
    const parsed = validateForm(
      vehicleFormSchema,
      vehicleSchemaInput({
        ...EMPTY_VEHICLE_FORM,
        kind: 'rigid',
        plate: 'RIG1234',
        unitType: 'torton',
      }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.capacityKg).toBeDefined();
  });

  it('round-trips a stored row into the form', () => {
    expect(
      vehicleFormFromRow({
        id: 'v1',
        kind: 'rigid',
        plate: 'RIG1234',
        fleet_number: null,
        model_year: 2020,
        unit_type: 'torton',
        capacity_kg: 12000,
        capacity_m3: 45.5,
        features: [],
      }),
    ).toEqual({
      kind: 'rigid',
      plate: 'RIG1234',
      fleetNumber: '',
      modelYear: '2020',
      unitType: 'torton',
      capacityKg: '12000',
      capacityM3: '45.5',
      features: [],
    });
  });
});

describe('photoResize', () => {
  it('keeps small photos and scales the longest side of large ones', () => {
    expect(photoResize(1600, 1200)).toBeNull();
    expect(photoResize(4032, 3024)).toEqual({ width: 2000 });
    expect(photoResize(3024, 4032)).toEqual({ height: 2000 });
  });
});

describe('toggleItem', () => {
  it('adds and removes values', () => {
    expect(toggleItem(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleItem(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('fleetErrorMessage', () => {
  it('maps fleet constraint and RPC errors to Spanish copy', () => {
    expect(
      fleetErrorMessage({
        code: '23505',
        message: 'duplicate key value violates unique constraint "vehicles_company_plate_key"',
      }),
    ).toBe(fleetErrorCopy.plateTaken);
    expect(
      fleetErrorMessage({ message: 'vehicle has expired documents: vehicle_insurance_policy' }),
    ).toBe(fleetErrorCopy.expiredDocuments);
    expect(fleetErrorMessage({ message: 'operator already has an account' })).toBe(
      fleetErrorCopy.operatorHasAccount,
    );
  });

  it('falls back to the app errors and never shows raw messages', () => {
    expect(fleetErrorMessage({ message: 'Network request failed' })).toBe(mobileErrorCopy.network);
    expect(fleetErrorMessage(new Error('boom'))).toBe(mobileErrorCopy.unknown);
    expect(fleetErrorMessage(new Error('boom'), fleetErrorCopy.uploadFailed)).toBe(
      fleetErrorCopy.uploadFailed,
    );
    expect(fleetErrorMessage('text')).toBe(mobileErrorCopy.unknown);
  });
});
