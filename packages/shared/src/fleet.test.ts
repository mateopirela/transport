import { describe, expect, it } from 'vitest';

import { fleetCopy, fleetErrorCopy, vehicleReadinessLabels } from './copy/fleet';
import { validationMessages as m } from './copy/validation';
import {
  CITY_PRESETS,
  cityPreset,
  expiredRequirementIds,
  findCityPreset,
  fleetErrorText,
  mexicoCityDateTime,
  mexicoCityParts,
  toEwktPoint,
  unitLabel,
  vehicleReadiness,
} from './fleet';
import { fromEwkbPoint } from './geo';
import {
  availabilityFormSchema,
  carrierRouteFormSchema,
  documentExpirySchema,
  operatorDraftSchema,
  operatorDraftSchemaFor,
} from './schemas/fleet';

const NOW = new Date('2026-10-15T18:00:00Z');

describe('vehicleReadiness', () => {
  it('marks a unit with expired documents as not available, whatever its availability', () => {
    expect(
      vehicleReadiness({ expiredDocuments: true, availableFrom: '2026-10-01T00:00:00Z' }, NOW),
    ).toBe('expired_documents');
  });

  it('marks a unit waiting for its release first, even with expired documents (G5)', () => {
    expect(
      vehicleReadiness({ expiredDocuments: true, availableFrom: null, pendingRelease: true }, NOW),
    ).toBe('pending_release');
    expect(
      vehicleReadiness(
        {
          expiredDocuments: false,
          availableFrom: '2026-10-15T08:00:00-06:00',
          pendingRelease: false,
        },
        NOW,
      ),
    ).toBe('available');
  });

  it('distinguishes no availability, future availability and available now', () => {
    expect(vehicleReadiness({ expiredDocuments: false, availableFrom: null }, NOW)).toBe('unset');
    expect(
      vehicleReadiness(
        { expiredDocuments: false, availableFrom: '2026-10-16T08:00:00-06:00' },
        NOW,
      ),
    ).toBe('scheduled');
    expect(
      vehicleReadiness(
        { expiredDocuments: false, availableFrom: '2026-10-15T08:00:00-06:00' },
        NOW,
      ),
    ).toBe('available');
  });

  it('has a label for every state', () => {
    for (const label of Object.values(vehicleReadinessLabels)) expect(label).not.toBe('');
  });
});

describe('expiredRequirementIds', () => {
  const owner = { type: 'vehicle', id: 'v1' } as const;
  const insurance = { id: 'r-ins', is_required: true, requires_expiry: true };
  const card = { id: 'r-card', is_required: true, requires_expiry: false };
  const optional = { id: 'r-opt', is_required: false, requires_expiry: true };
  const doc = (
    requirement_id: string,
    status: 'approved' | 'pending_review',
    expires_at: string | null,
    extra: { owner_id?: string; archived_at?: string | null } = {},
  ) => ({
    requirement_id,
    owner_type: 'vehicle' as const,
    owner_id: extra.owner_id ?? 'v1',
    status,
    expires_at,
    archived_at: extra.archived_at ?? null,
  });

  it('reports required documents whose approved version expired', () => {
    expect(
      expiredRequirementIds(
        [insurance, card, optional],
        [
          doc('r-ins', 'approved', '2026-10-01T00:00:00Z'),
          doc('r-card', 'approved', null),
          doc('r-opt', 'approved', '2026-01-01T00:00:00Z'),
        ],
        owner,
        NOW,
      ),
    ).toEqual(['r-ins']);
  });

  it('keeps the block while the renewal is in review, and lifts it once approved', () => {
    const expired = doc('r-ins', 'approved', '2026-10-01T00:00:00Z');
    expect(
      expiredRequirementIds(
        [insurance],
        [expired, doc('r-ins', 'pending_review', '2027-10-01T00:00:00Z')],
        owner,
        NOW,
      ),
    ).toEqual(['r-ins']);
    expect(
      expiredRequirementIds(
        [insurance],
        [
          doc('r-ins', 'approved', '2026-10-01T00:00:00Z', { archived_at: '2026-10-10T00:00:00Z' }),
          doc('r-ins', 'approved', '2027-10-01T00:00:00Z'),
        ],
        owner,
        NOW,
      ),
    ).toEqual([]);
  });

  it('treats a document marked expired like an approved one past its date', () => {
    const marked = { ...doc('r-card', 'approved', null), status: 'expired' as const };
    expect(expiredRequirementIds([card], [marked], owner, NOW)).toEqual(['r-card']);
    expect(
      expiredRequirementIds([card], [marked, doc('r-card', 'approved', null)], owner, NOW),
    ).toEqual([]);
  });

  it('ignores missing documents and other owners', () => {
    expect(
      expiredRequirementIds(
        [insurance, card],
        [doc('r-ins', 'approved', '2026-10-01T00:00:00Z', { owner_id: 'v2' })],
        owner,
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('unitLabel', () => {
  it('prefers the fleet number and falls back to the plate', () => {
    expect(unitLabel({ fleet_number: 'CS53-01', plate: '82UR4C' })).toBe('CS53-01');
    expect(unitLabel({ fleet_number: null, plate: '82UR4C' })).toBe('82UR4C');
    expect(unitLabel({ fleet_number: '', plate: '82UR4C' })).toBe('82UR4C');
  });
});

describe('city presets', () => {
  it('cover the pilot corridor with unique ids and coordinates inside Mexico', () => {
    expect(new Set(CITY_PRESETS.map((c) => c.id)).size).toBe(CITY_PRESETS.length);
    for (const c of CITY_PRESETS) {
      expect(c.lat).toBeGreaterThan(14);
      expect(c.lat).toBeLessThan(33);
      expect(c.lng).toBeGreaterThan(-119);
      expect(c.lng).toBeLessThan(-86);
    }
    expect(cityPreset('mty')?.city).toBe('Monterrey');
    expect(cityPreset('nope')).toBeUndefined();
    expect(findCityPreset('Guadalajara', 'Jalisco')?.id).toBe('gdl');
    expect(findCityPreset('Guadalajara', 'Nuevo León')).toBeUndefined();
  });
});

describe('toEwktPoint', () => {
  it('writes longitude first with SRID 4326', () => {
    expect(toEwktPoint({ lat: 25.5, lng: -100.25 })).toBe('SRID=4326;POINT(-100.25 25.5)');
  });

  it('rejects impossible coordinates', () => {
    expect(() => toEwktPoint({ lat: 95, lng: 0 })).toThrow(RangeError);
    expect(() => toEwktPoint({ lat: 0, lng: Number.NaN })).toThrow(RangeError);
  });
});

describe('Mexico City date-times', () => {
  it('builds an ISO timestamp with the UTC-6 offset', () => {
    expect(mexicoCityDateTime('2026-10-20', '08:30')).toBe('2026-10-20T08:30:00-06:00');
    expect(mexicoCityDateTime(' 2026-10-20 ', ' 23:59 ')).toBe('2026-10-20T23:59:00-06:00');
  });

  it('rejects malformed or impossible values', () => {
    expect(mexicoCityDateTime('2026-02-30', '08:00')).toBeNull();
    expect(mexicoCityDateTime('20-10-2026', '08:00')).toBeNull();
    expect(mexicoCityDateTime('2026-10-20', '24:00')).toBeNull();
    expect(mexicoCityDateTime('2026-10-20', '8:00')).toBeNull();
  });

  it('splits a moment into its Mexico City date and time', () => {
    expect(mexicoCityParts(new Date('2026-10-15T03:15:00Z'))).toEqual({
      date: '2026-10-14',
      time: '21:15',
    });
  });
});

describe('operatorDraftSchema', () => {
  it('needs only the name; blank optional fields are dropped', () => {
    const result = operatorDraftSchema.parse({
      fullName: ' Omar Díaz ',
      email: 'Omar@Fletes.MX',
      phone: '',
      licenseNumber: ' ',
      licenseExpiresOn: '',
    });
    expect(result).toEqual({ fullName: 'Omar Díaz', email: 'omar@fletes.mx' });
  });

  it('normalizes and validates the optional license data', () => {
    const result = operatorDraftSchema.parse({
      fullName: 'Omar',
      email: 'omar@fletes.mx',
      phone: '+52 (81) 1234-5678',
      licenseNumber: 'mty 12345',
      licenseType: 'E',
      licenseExpiresOn: '2099-01-31',
    });
    expect(result).toMatchObject({
      phone: '8112345678',
      licenseNumber: 'MTY12345',
      licenseType: 'E',
    });
    const expired = operatorDraftSchema.safeParse({
      fullName: 'Omar',
      email: 'omar@fletes.mx',
      licenseExpiresOn: '2000-01-01',
    });
    expect(expired.success).toBe(false);
    expect(expired.error?.issues[0]?.message).toBe(m.licenseExpired);
  });

  it('takes the email as optional (operators sign in with their phone, G2)', () => {
    expect(operatorDraftSchema.parse({ fullName: 'Omar', email: '' })).toEqual({
      fullName: 'Omar',
    });
    expect(operatorDraftSchema.parse({ fullName: 'Omar' })).toEqual({ fullName: 'Omar' });
    expect(operatorDraftSchema.safeParse({ fullName: 'Omar', email: 'omar' }).success).toBe(false);
  });
});

describe('operatorDraftSchemaFor (editing)', () => {
  const base = { fullName: 'Omar', email: 'omar@fletes.mx' };

  it('keeps the saved expired license date so other fields can change', () => {
    const schema = operatorDraftSchemaFor('2020-01-01');
    const result = schema.parse({ ...base, phone: '8112345678', licenseExpiresOn: '2020-01-01' });
    expect(result.licenseExpiresOn).toBe('2020-01-01');
  });

  it('still rejects a different expired date', () => {
    const result = operatorDraftSchemaFor('2020-01-01').safeParse({
      ...base,
      licenseExpiresOn: '2021-06-30',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(m.licenseExpired);
  });

  it('without a saved date behaves like the registration schema', () => {
    expect(
      operatorDraftSchemaFor(null).safeParse({ ...base, licenseExpiresOn: '2020-01-01' }).success,
    ).toBe(false);
    expect(
      operatorDraftSchemaFor(null).safeParse({ ...base, licenseExpiresOn: '2099-01-31' }).success,
    ).toBe(true);
  });
});

describe('availabilityFormSchema', () => {
  it('returns the city and the timestamp in Mexico City', () => {
    expect(
      availabilityFormSchema.parse({ cityId: 'gdl', date: '2026-10-20', time: '07:00' }),
    ).toEqual({ cityId: 'gdl', availableFrom: '2026-10-20T07:00:00-06:00' });
  });

  it('reports an invalid date or an unknown city', () => {
    const bad = availabilityFormSchema.safeParse({
      cityId: 'gdl',
      date: '2026-13-01',
      time: '07:00',
    });
    expect(bad.error?.issues[0]).toMatchObject({ message: m.dateTime, path: ['date'] });
    expect(
      availabilityFormSchema.safeParse({ cityId: 'xx', date: '2026-10-20', time: '07:00' }).success,
    ).toBe(false);
  });
});

describe('carrierRouteFormSchema', () => {
  it('accepts a route between two cities, with optional unit types', () => {
    expect(carrierRouteFormSchema.parse({ originId: 'mty', destinationId: 'gdl' })).toEqual({
      originId: 'mty',
      destinationId: 'gdl',
      unitTypes: [],
    });
  });

  it('rejects the same origin and destination', () => {
    const result = carrierRouteFormSchema.safeParse({ originId: 'mty', destinationId: 'mty' });
    expect(result.error?.issues[0]).toMatchObject({
      message: m.sameOriginDestination,
      path: ['destinationId'],
    });
  });
});

describe('documentExpirySchema', () => {
  it('is optional and rejects past dates', () => {
    expect(documentExpirySchema.parse('')).toBeUndefined();
    expect(documentExpirySchema.parse('2099-12-31')).toBe('2099-12-31');
    expect(documentExpirySchema.safeParse('2001-01-01').success).toBe(false);
    expect(documentExpirySchema.safeParse('31/12/2099').success).toBe(false);
  });
});

describe('fleet copy', () => {
  it('builds the invitation message with the link', () => {
    const text = fleetCopy.invitation.shareMessage(
      'Fletes Alfa',
      'https://transport.test/invitacion/X',
    );
    expect(text).toContain('Fletes Alfa');
    expect(text).toContain('https://transport.test/invitacion/X');
    expect(fleetCopy.onboarding.count(1)).toBe('1 registrada');
    expect(fleetCopy.onboarding.operatorsCount(3)).toBe('3 registrados');
  });
});

describe('fleetErrorText', () => {
  it('maps the fixed messages of the fleet writes', () => {
    expect(
      fleetErrorText('duplicate key value violates unique constraint "vehicles_company_plate_key"'),
    ).toBe(fleetErrorCopy.plateTaken);
    expect(fleetErrorText('vehicle has expired documents')).toBe(fleetErrorCopy.expiredDocuments);
    expect(fleetErrorText('cannot archive: it is assigned to a trip in progress')).toBe(
      fleetErrorCopy.archiveBlocked,
    );
    expect(fleetErrorText('only the manager can move or archive units and operators')).toBe(
      fleetErrorCopy.managerOnly,
    );
    expect(fleetErrorText('business_unit_id is required')).toBe(
      fleetErrorCopy.businessUnitRequired,
    );
  });

  it('leaves unknown messages to the caller', () => {
    expect(fleetErrorText('')).toBeNull();
    expect(fleetErrorText('permission denied for table vehicles')).toBeNull();
  });
});

describe('fromEwkbPoint', () => {
  it('reads the point PostgREST returns for a geography column', () => {
    // Monterrey and Saltillo as stored by the seed.
    const mty = fromEwkbPoint('0101000020E610000000917EFB3A1459C0006F8104C5AF3940');
    expect(mty?.lat).toBeCloseTo(25.6866, 4);
    expect(mty?.lng).toBeCloseTo(-100.3161, 4);
    const saltillo = fromEwkbPoint('0101000020e61000005f07ce19513e59c039d6c56d34703940');
    expect(saltillo?.lat).toBeCloseTo(25.4383, 4);
    expect(saltillo?.lng).toBeCloseTo(-100.9737, 4);
  });

  it('refuses anything that is not a 4326 point', () => {
    expect(fromEwkbPoint(null)).toBeNull();
    expect(fromEwkbPoint('SRID=4326;POINT(-100 25)')).toBeNull();
    // Without the SRID flag (plain WKB) or with another SRID.
    expect(fromEwkbPoint('0101000000000000000000000000000000000000000000000000')).toBeNull();
    expect(fromEwkbPoint('0101000020E710000000917EFB3A1459C0006F8104C5AF3940')).toBeNull();
  });
});
