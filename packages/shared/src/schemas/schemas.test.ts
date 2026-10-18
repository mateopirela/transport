import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { emailField, phoneField, placeSchema, timeWindowSchema } from './common';
import { companyFiscalSchema, companyRegistrationSchema, rfcField } from './company';
import { loadFormSchema, type LoadFormInput } from './load';
import { adminContractSchema, offerFormSchema } from './offer';
import { operatorFormSchema, todayInMexicoCity } from './operator';
import { vehicleFormSchema, type VehicleFormInput } from './vehicle';

/** Messages of a failed parse, keyed by dotted path. */
function issues(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

const MTY = {
  address: 'Av. Constitución 100',
  city: 'Monterrey',
  state: 'Nuevo León',
  lat: 25.67,
  lng: -100.31,
};
const GDL = {
  address: 'Av. Vallarta 200',
  city: 'Guadalajara',
  state: 'Jalisco',
  lat: 20.67,
  lng: -103.35,
};

describe('Spanish messages (D02)', () => {
  const known = new Set(
    (Object.values(m) as unknown[]).filter((value): value is string => typeof value === 'string'),
  );
  const isCopy = (message: string) =>
    known.has(message) || /^(Máximo \d+ caracteres|El valor máximo es [\d,]+)\.$/u.test(message);

  it.each([
    ['load', loadFormSchema],
    ['offer', offerFormSchema],
    ['admin contract', adminContractSchema],
    ['vehicle', vehicleFormSchema],
    ['company', companyRegistrationSchema],
    ['company fiscal data', companyFiscalSchema],
    ['operator', operatorFormSchema],
  ] as const)(
    '%s form reports only copy/ messages for incomplete or malformed input',
    (_, schema) => {
      const inputs: unknown[] = [
        undefined,
        null,
        'texto',
        {},
        Object.fromEntries(
          [
            'origin',
            'destination',
            'pickupWindow',
            'deliveryWindow',
            'specialRequirements',
            'features',
            'notes',
            'conditions',
            'fleetNumber',
            'tradeName',
            'modelYear',
            'weightKg',
            'capacityKg',
          ].map((key) => [key, 42]),
        ),
        { origin: {}, pickupWindow: {}, specialRequirements: [1], features: 'x', weightKg: 1e9 },
      ];
      for (const input of inputs) {
        const result = schema.safeParse(input);
        expect(result.success).toBe(false);
        for (const issue of result.error?.issues ?? []) {
          expect(isCopy(issue.message), `${issue.path.join('.')}: ${issue.message}`).toBe(true);
        }
      }
    },
  );
});

describe('common fields', () => {
  it('normalizes emails and Mexican phones', () => {
    expect(emailField.parse('  Ana@Example.COM ')).toBe('ana@example.com');
    expect(phoneField.parse('+52 (81) 1234-5678')).toBe('8112345678');
    expect(phoneField.parse('52 8112345678')).toBe('8112345678');
    expect(issues(phoneField, '12345')).toEqual({ '': m.phone });
    expect(issues(emailField, 'nope')).toEqual({ '': m.email });
  });

  it('rejects places outside Mexico', () => {
    expect(placeSchema.safeParse(MTY).success).toBe(true);
    expect(issues(placeSchema, { ...MTY, lat: 40.7, lng: -74 })).toEqual({ lat: m.outsideMexico });
  });

  it('requires ordered time windows', () => {
    const window = { start: '2026-10-20T08:00:00-06:00', end: '2026-10-20T07:00:00-06:00' };
    expect(issues(timeWindowSchema, window)).toEqual({ end: m.windowOrder });
    expect(issues(timeWindowSchema, { ...window, end: '2026-10-20' })).toEqual({
      end: m.dateTime,
    });
  });
});

describe('loadFormSchema', () => {
  const valid: LoadFormInput = {
    origin: MTY,
    destination: GDL,
    pickupWindow: { start: '2026-10-20T08:00:00-06:00', end: '2026-10-20T12:00:00-06:00' },
    deliveryWindow: { start: '2026-10-21T08:00:00-06:00', end: '2026-10-21T18:00:00-06:00' },
    cargoType: 'palletized',
    description: '20 tarimas de refrescos',
    weightKg: 22_000,
    unitType: 'dry_van',
    proposedPriceCents: 3_500_000,
  };

  it('accepts a MTY → GDL load and defaults optional lists', () => {
    const load = loadFormSchema.parse({ ...valid, notes: '   ' });
    expect(load.specialRequirements).toEqual([]);
    expect(load.notes).toBeUndefined();
  });

  it('rejects inconsistent windows, same places and bad amounts', () => {
    expect(
      issues(loadFormSchema, {
        ...valid,
        deliveryWindow: { start: '2026-10-19T08:00:00-06:00', end: '2026-10-19T09:00:00-06:00' },
      }),
    ).toEqual({ 'deliveryWindow.end': m.deliveryBeforePickup });
    expect(issues(loadFormSchema, { ...valid, destination: { ...MTY, address: 'Otra' } })).toEqual({
      destination: m.sameOriginDestination,
    });
    expect(issues(loadFormSchema, { ...valid, proposedPriceCents: 3500.5 })).toEqual({
      proposedPriceCents: m.amount,
    });
    expect(issues(loadFormSchema, { ...valid, proposedPriceCents: 0 })).toEqual({
      proposedPriceCents: m.positiveNumber,
    });
  });

  it('rejects unknown catalog values, duplicates and empty text', () => {
    expect(
      issues(loadFormSchema, {
        ...valid,
        unitType: 'spaceship',
        specialRequirements: ['tarp', 'tarp'],
        description: '  ',
      }),
    ).toEqual({
      unitType: m.invalidOption,
      specialRequirements: m.duplicateItems,
      description: m.required,
    });
  });
});

describe('offerFormSchema', () => {
  it('accepts an amount with optional unit and conditions', () => {
    expect(offerFormSchema.parse({ amountCents: 3_200_000 })).toEqual({ amountCents: 3_200_000 });
    expect(
      offerFormSchema.safeParse({
        amountCents: 3_200_000,
        conditions: 'Incluye maniobras',
        vehicleId: '7f0d4a4e-3b8c-4f7a-9d55-2f1e7c1b9a10',
      }).success,
    ).toBe(true);
  });

  it('rejects bad amounts and ids', () => {
    expect(issues(offerFormSchema, { amountCents: 10_000_000_001, vehicleId: 'x' })).toEqual({
      amountCents: m.amountTooHigh,
      vehicleId: m.uuid,
    });
  });
});

describe('adminContractSchema', () => {
  const carrierCompanyId = '7f0d4a4e-3b8c-4f7a-9d55-2f1e7c1b9a10';

  it('accepts a carrier, an amount and whether to contract at once', () => {
    expect(
      adminContractSchema.parse({ carrierCompanyId, amountCents: 3_200_000, accept: true }),
    ).toEqual({ carrierCompanyId, amountCents: 3_200_000, accept: true });
  });

  it('requires the carrier and the amount', () => {
    expect(issues(adminContractSchema, { carrierCompanyId: 'x', accept: false })).toEqual({
      carrierCompanyId: m.uuid,
      amountCents: m.amount,
    });
  });
});

describe('vehicleFormSchema', () => {
  const trailer: VehicleFormInput = {
    kind: 'trailer',
    plate: 'abc-12-34',
    unitType: 'refrigerated',
    capacityKg: 25_000,
    capacityM3: 70,
    features: ['temperature_control'],
  };

  it('normalizes plates and accepts a trailer with body and capacity', () => {
    expect(vehicleFormSchema.parse(trailer).plate).toBe('ABC1234');
  });

  it('accepts a tractor without body', () => {
    expect(
      vehicleFormSchema.safeParse({ kind: 'tractor', plate: '12AB34', modelYear: 2020 }).success,
    ).toBe(true);
  });

  it('requires body and capacity on rigid trucks and trailers', () => {
    expect(issues(vehicleFormSchema, { kind: 'rigid', plate: 'ABC1234' })).toEqual({
      unitType: m.unitTypeRequired,
      capacityKg: m.capacityRequired,
    });
  });

  it('rejects body data on a tractor, bad plates and years', () => {
    expect(issues(vehicleFormSchema, { ...trailer, kind: 'tractor', features: [] })).toEqual({
      unitType: m.tractorNoBody,
      capacityKg: m.tractorNoBody,
      capacityM3: m.tractorNoBody,
    });
    expect(issues(vehicleFormSchema, { ...trailer, plate: 'A1' })).toEqual({ plate: m.plate });
    expect(issues(vehicleFormSchema, { ...trailer, modelYear: 1900 })).toEqual({
      modelYear: m.vehicleYear,
    });
    expect(issues(vehicleFormSchema, { ...trailer, modelYear: 3000 })).toEqual({
      modelYear: m.vehicleYear,
    });
  });
});

describe('companyRegistrationSchema (RFC and fiscal data)', () => {
  const base = {
    kind: 'carrier',
    personType: 'moral',
    legalName: 'Transportes del Norte, S.A. de C.V.',
    rfc: 'tno 970701 nn3',
    fiscalStreet: 'Av. Constitución',
    fiscalExteriorNumber: '400',
    fiscalNeighborhood: 'Centro',
    fiscalPostalCode: '64000',
    fiscalMunicipality: 'Monterrey',
    fiscalState: 'Nuevo León',
    legalRepresentativeName: 'Juan Pérez',
    contactName: 'Juan Pérez',
    contactEmail: 'juan@tnorte.mx',
    contactPhone: '81 1234 5678',
  };

  it('accepts a persona moral with a 12-character RFC and normalizes it and the phone', () => {
    const values = companyRegistrationSchema.parse(base);
    expect(values.rfc).toBe('TNO970701NN3');
    expect(values.contactPhone).toBe('+528112345678');
    expect(values.fiscalInteriorNumber).toBeUndefined();
  });

  it('accepts a persona física (owner-operator) with a 13-character RFC and no representative', () => {
    expect(
      companyRegistrationSchema.safeParse({
        ...base,
        kind: 'owner_operator',
        personType: 'fisica',
        rfc: 'GODE561231GR8',
        legalRepresentativeName: undefined,
      }).success,
    ).toBe(true);
    expect(issues(companyRegistrationSchema, { ...base, legalRepresentativeName: '' })).toEqual({
      legalRepresentativeName: m.required,
    });
  });

  it('rejects an RFC whose length does not match the person type', () => {
    expect(issues(companyRegistrationSchema, { ...base, rfc: 'GODE561231GR8' })).toEqual({
      rfc: m.rfcMoral,
    });
    expect(issues(companyRegistrationSchema, { ...base, personType: 'fisica' })).toEqual({
      rfc: m.rfcFisica,
    });
  });

  it('reports only the RFC error when the RFC itself is malformed', () => {
    expect(issues(companyRegistrationSchema, { ...base, rfc: 'nope' })).toEqual({
      rfc: m.rfcFormat,
    });
  });

  it('validates the postal code and the state', () => {
    expect(
      issues(companyRegistrationSchema, {
        ...base,
        fiscalPostalCode: 'abcde',
        fiscalState: 'Texas',
      }),
    ).toEqual({ fiscalPostalCode: m.postalCode, fiscalState: m.mxState });
  });

  it.each([
    ['TNO97070NN3', m.rfcFormat],
    ['TNO971301NN3', m.rfcDate],
    ['XAXX010101000', m.rfcGeneric],
  ])('reports why %s is invalid', (rfc, message) => {
    expect(issues(rfcField, rfc)).toEqual({ '': message });
  });
});

describe('operatorFormSchema', () => {
  const base = {
    fullName: 'María López',
    email: 'maria@example.com',
    phone: '3312345678',
    licenseNumber: 'nl 123456',
    licenseType: 'B',
    licenseExpiresOn: '2099-12-31',
  };

  it('accepts a valid operator and normalizes the license number', () => {
    expect(operatorFormSchema.parse(base).licenseNumber).toBe('NL123456');
  });

  it('accepts a license expiring today and rejects an expired one', () => {
    expect(
      operatorFormSchema.safeParse({ ...base, licenseExpiresOn: todayInMexicoCity() }).success,
    ).toBe(true);
    expect(issues(operatorFormSchema, { ...base, licenseExpiresOn: '2020-01-01' })).toEqual({
      licenseExpiresOn: m.licenseExpired,
    });
  });

  it('rejects unsupported license types and malformed dates', () => {
    expect(
      issues(operatorFormSchema, { ...base, licenseType: 'A', licenseExpiresOn: '31/12/2099' }),
    ).toEqual({
      licenseType: m.invalidOption,
      licenseExpiresOn: m.date,
    });
  });

  it('computes today in Mexico City, not UTC', () => {
    expect(todayInMexicoCity(new Date('2026-10-15T03:00:00Z'))).toBe('2026-10-14');
  });
});
