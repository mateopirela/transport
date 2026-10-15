import { describe, expect, expectTypeOf, it } from 'vitest';

import { Constants } from './db';
import { CARGO_TYPES, LOAD_STATUSES, OFFER_SIDES, OFFER_STATUSES } from './enums';
import type { Database, Enums, Tables } from './index';
import { loadFormSchema } from './schemas';

type Functions = Database['public']['Functions'];

// Guards the generated types (pnpm db:types) against drifting from the loads
// and negotiation schema of B05 (supabase/migrations/*_loads_negotiation.sql),
// and keeps the SQL enums in sync with the domain catalogs of B02.
describe('generated database types (B05)', () => {
  it('matches the load and offer enums with the domain catalogs', () => {
    expect(Constants.public.Enums.load_status).toEqual([...LOAD_STATUSES]);
    expect(Constants.public.Enums.offer_status).toEqual([...OFFER_STATUSES]);
    expect(Constants.public.Enums.offer_side).toEqual([...OFFER_SIDES]);
    expect(Constants.public.Enums.cargo_type).toEqual([...CARGO_TYPES]);
  });

  it('types loads, negotiations and offers', () => {
    expectTypeOf<Tables<'loads'>['status']>().toEqualTypeOf<Enums<'load_status'>>();
    expectTypeOf<Tables<'loads'>['proposed_price_cents']>().toEqualTypeOf<number>();
    expectTypeOf<Tables<'loads'>['carrier_company_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<Tables<'negotiations'>['carrier_company_id']>().toEqualTypeOf<string>();
    expectTypeOf<Tables<'offers'>['side']>().toEqualTypeOf<Enums<'offer_side'>>();
    expectTypeOf<Tables<'offers'>['status']>().toEqualTypeOf<Enums<'offer_status'>>();
  });

  it('types the load and negotiation RPCs', () => {
    expectTypeOf<Functions['create_load']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['make_offer']['Args']['p_amount_cents']>().toEqualTypeOf<number>();
    expectTypeOf<Functions['counter_offer']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['cancel_load']['Args']['p_load_id']>().toEqualTypeOf<string>();
  });
});

// create_load / update_load read the JSON output of loadFormSchema
// (apply_load_payload in SQL). This pins the keys the SQL expects.
describe('load RPC payload', () => {
  it('serializes loadFormSchema output with the keys apply_load_payload reads', () => {
    const values = loadFormSchema.parse({
      origin: {
        address: 'Av. Constitución 100',
        city: 'Monterrey',
        state: 'Nuevo León',
        lat: 25.6866,
        lng: -100.3161,
        placeId: 'mty',
      },
      destination: {
        address: 'Av. Vallarta 200',
        city: 'Guadalajara',
        state: 'Jalisco',
        lat: 20.6597,
        lng: -103.3496,
      },
      pickupWindow: { start: '2026-11-02T08:00:00-06:00', end: '2026-11-02T12:00:00-06:00' },
      deliveryWindow: { start: '2026-11-03T08:00:00-06:00', end: '2026-11-03T18:00:00-06:00' },
      cargoType: 'palletized',
      description: 'Tarimas',
      weightKg: 18000,
      volumeM3: 60,
      unitType: 'dry_van',
      specialRequirements: ['tarp'],
      proposedPriceCents: 3_500_000,
      notes: 'Rampa 3',
    });
    const payload = JSON.parse(JSON.stringify(values)) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(
      [
        'cargoType',
        'deliveryWindow',
        'description',
        'destination',
        'notes',
        'origin',
        'pickupWindow',
        'proposedPriceCents',
        'specialRequirements',
        'unitType',
        'volumeM3',
        'weightKg',
      ].sort(),
    );
    expect(Object.keys(payload.origin as object).sort()).toEqual(
      ['address', 'city', 'lat', 'lng', 'placeId', 'state'].sort(),
    );
    expect(payload.pickupWindow).toEqual({
      start: '2026-11-02T08:00:00-06:00',
      end: '2026-11-02T12:00:00-06:00',
    });
    expect(Number.isInteger(payload.proposedPriceCents)).toBe(true);
  });
});
