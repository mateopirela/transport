import { describe, expect, it } from 'vitest';

import {
  appShareLink,
  DEFAULT_SHARE_VALIDITY_HOURS,
  FORBIDDEN_PUBLIC_KEYS,
  internalSharedLoadSchema,
  isShareToken,
  jsonKeys,
  MAX_SHARE_VALIDITY_HOURS,
  parseShareValidityHours,
  publicSharedLoadSchema,
  publicSharedTripSchema,
  SHARE_LINK_KINDS,
  SHARE_VALIDITY_HOURS,
  sharedTripRefreshMs,
  sharePath,
  shareUrl,
} from './share-links';

const token = 'Qm9vay1vZi1zaGFyZS10b2tlbnMtMzItYnl0ZXMtMDA';

describe('share tokens', () => {
  it('accepts 43 base64url characters and nothing else', () => {
    expect(token).toHaveLength(43);
    expect(isShareToken(token)).toBe(true);
    expect(isShareToken(`${token}=`)).toBe(false);
    expect(isShareToken(token.slice(1))).toBe(false);
    expect(isShareToken(token.replace('Q', '+'))).toBe(false);
    expect(isShareToken(token.replace('Q', '/'))).toBe(false);
    expect(isShareToken('')).toBe(false);
    expect(isShareToken(null)).toBe(false);
    expect(isShareToken(42)).toBe(false);
  });
});

describe('validity', () => {
  it('offers choices up to the 30-day maximum of the RPC', () => {
    expect(Math.max(...SHARE_VALIDITY_HOURS)).toBe(MAX_SHARE_VALIDITY_HOURS);
    for (const kind of SHARE_LINK_KINDS) {
      expect(SHARE_VALIDITY_HOURS).toContain(DEFAULT_SHARE_VALIDITY_HOURS[kind]);
    }
    expect(DEFAULT_SHARE_VALIDITY_HOURS).toEqual({
      load_internal: 72,
      load_public: 168,
      trip_tracking_public: 720,
    });
  });

  it('parses only the offered choices', () => {
    expect(parseShareValidityHours('168')).toBe(168);
    expect(parseShareValidityHours(24)).toBe(24);
    for (const bad of ['0', '1', '721', '48', 'abc', '', null, undefined, 1e9]) {
      expect(parseShareValidityHours(bad)).toBeNull();
    }
  });
});

describe('links', () => {
  it('builds the public and internal paths', () => {
    expect(sharePath('load_public', token)).toBe(`/compartido/${token}`);
    expect(sharePath('trip_tracking_public', token)).toBe(`/compartido/${token}`);
    expect(sharePath('load_internal', token)).toBe(`/transportista/compartido/${token}`);
  });

  it('builds absolute URLs only on a safe site origin', () => {
    expect(shareUrl('https://transport.mx/', 'load_public', token)).toBe(
      `https://transport.mx/compartido/${token}`,
    );
    expect(shareUrl('http://127.0.0.1:3000', 'load_internal', token)).toBe(
      `http://127.0.0.1:3000/transportista/compartido/${token}`,
    );
    for (const bad of [
      undefined,
      null,
      '',
      'not a url',
      'http://transport.mx',
      'https://u:p@t.mx',
    ]) {
      expect(shareUrl(bad, 'load_public', token)).toBeNull();
    }
  });

  it('builds the deep link of the app', () => {
    expect(appShareLink(token)).toBe(`transport://compartido/${token}`);
  });

  it('refreshes the tracking until the trip is over', () => {
    expect(sharedTripRefreshMs('assigned')).toBe(60_000);
    expect(sharedTripRefreshMs('in_transit')).toBe(60_000);
    expect(sharedTripRefreshMs('delivered')).toBe(60_000);
    expect(sharedTripRefreshMs('closed')).toBeNull();
    expect(sharedTripRefreshMs('cancelled')).toBeNull();
  });
});

const publicLoad = {
  kind: 'load',
  status: 'published',
  origin: { city: 'Monterrey', state: 'Nuevo León' },
  destination: { city: 'Guadalajara', state: 'Jalisco' },
  pickupWindow: { start: '2026-10-20T12:00:00+00:00', end: '2026-10-20T16:00:00+00:00' },
  deliveryWindow: { start: '2026-10-21T12:00:00+00:00', end: '2026-10-21T18:00:00+00:00' },
  cargoType: 'palletized',
  weightKg: 18000,
  unitType: 'dry_van',
  specialRequirements: ['tarp'],
  expiresAt: '2026-10-27T12:00:00+00:00',
};

const publicTrip = {
  kind: 'trip',
  status: 'in_transit',
  origin: { city: 'Monterrey', state: 'Nuevo León' },
  destination: { city: 'Guadalajara', state: 'Jalisco' },
  pickupWindow: { start: '2026-10-20T12:00:00+00:00', end: '2026-10-20T16:00:00+00:00' },
  deliveryWindow: { start: '2026-10-21T12:00:00+00:00', end: '2026-10-21T18:00:00+00:00' },
  estimatedUnloadEndAt: null,
  carrierName: 'Transportes Regios del Norte, S.A. de C.V.',
  unitType: 'dry_van',
  plateMasked: '***R4C',
  timeline: [
    { type: 'created', occurredAt: '2026-10-19T12:00:00+00:00' },
    { type: 'departed', occurredAt: '2026-10-20T10:00:00+00:00' },
  ],
  lastPosition: { lat: 24.1, lng: -101.2, recordedAt: '2026-10-20T15:00:00+00:00' },
  expiresAt: '2026-11-19T12:00:00+00:00',
};

describe('sanitized public documents', () => {
  it('parse the JSON the public RPCs return', () => {
    expect(publicSharedLoadSchema.parse(publicLoad)).toEqual(publicLoad);
    expect(publicSharedTripSchema.parse(publicTrip)).toEqual(publicTrip);
    expect(
      publicSharedTripSchema.parse({ ...publicTrip, lastPosition: null, plateMasked: null }),
    ).toMatchObject({ lastPosition: null, plateMasked: null });
  });

  it('refuse any key the RPC did not promise (a leak fails closed)', () => {
    expect(publicSharedLoadSchema.safeParse({ ...publicLoad, proposedPriceCents: 1 }).success).toBe(
      false,
    );
    expect(
      publicSharedLoadSchema.safeParse({
        ...publicLoad,
        origin: { ...publicLoad.origin, address: 'Av. Constitución 100' },
      }).success,
    ).toBe(false);
    expect(publicSharedTripSchema.safeParse({ ...publicTrip, operatorName: 'Pedro' }).success).toBe(
      false,
    );
    expect(publicSharedTripSchema.safeParse({ ...publicTrip, plate: 'ABC123' }).success).toBe(
      false,
    );
    expect(
      publicSharedTripSchema.safeParse({
        ...publicTrip,
        timeline: [{ type: 'departed', occurredAt: 'x', notes: 'privado' }],
      }).success,
    ).toBe(false);
  });

  it('promise none of the forbidden keys', () => {
    const forbidden = new Set<string>(FORBIDDEN_PUBLIC_KEYS);
    for (const key of [...jsonKeys(publicLoad), ...jsonKeys(publicTrip)]) {
      expect(forbidden.has(key), key).toBe(false);
    }
    // The schemas themselves describe no forbidden field.
    const described = [
      ...Object.keys(publicSharedLoadSchema.shape),
      ...Object.keys(publicSharedTripSchema.shape),
    ];
    expect(described.filter((key) => forbidden.has(key))).toEqual([]);
  });

  it('keep the price and the notes only in the internal document', () => {
    const internal = {
      ...publicLoad,
      kind: 'load_internal',
      loadId: '5eed0005-0000-4000-8000-000000000002',
      canOffer: true,
      description: 'Tarimas',
      volumeM3: null,
      proposedPriceCents: 3500000,
      notes: null,
    };
    expect(internalSharedLoadSchema.parse(internal)).toEqual(internal);
    expect(publicSharedLoadSchema.safeParse(internal).success).toBe(false);
  });
});

describe('jsonKeys', () => {
  it('lists nested and array keys', () => {
    expect(jsonKeys({ a: 1, b: { c: [{ d: 2 }] } })).toEqual(['a', 'b', 'c', 'd']);
    expect(jsonKeys(null)).toEqual([]);
    expect(jsonKeys('x')).toEqual([]);
  });
});
