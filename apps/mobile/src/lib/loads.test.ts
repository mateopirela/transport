import { carrierLoadsCopy, mobileErrorCopy } from '@transport/shared';
import { describe, expect, it, vi } from 'vitest';

import { emptyLegs, unitLabel, unitRecommendations, type CarrierUnit } from './loads-api';
import { offerErrorMessage } from './offer-errors';
import { centsToPesosInput, parseOfferDraft } from './offer-form';
import type { Supabase } from './supabase';

const e = carrierLoadsCopy.errors;

describe('offerErrorMessage', () => {
  it('maps the negotiation RPC errors to Spanish', () => {
    const cases: [string, string][] = [
      ['company is not approved', e.notApproved],
      ['load not found', e.loadGone],
      ['cannot offer on a load in status contracted', e.loadClosed],
      ['load is no longer open (status contracted)', e.loadClosed],
      ['pickup window already ended', e.pickupEnded],
      ['negotiation already has a pending offer', e.pending],
      ['offer is no longer pending (status countered)', e.notPending],
      ['invalid offer: amount out of range', e.invalidAmount],
      ['invalid offer: vehicle not found', e.invalidUnit],
      ['both companies must be approved to contract', e.bothApproved],
    ];
    for (const [message, text] of cases) expect(offerErrorMessage({ message })).toBe(text);
  });

  it('never shows raw server text', () => {
    expect(offerErrorMessage({ message: 'relation "x" does not exist' })).toBe(e.generic);
    expect(offerErrorMessage(null)).toBe(e.generic);
    expect(offerErrorMessage({ message: 'Network request failed' })).toBe(mobileErrorCopy.network);
  });
});

describe('parseOfferDraft', () => {
  const draft = { amount: '38,500.50', conditions: '  Pago a 15 días ', vehicleId: undefined };

  it('turns pesos into integer cents', () => {
    expect(parseOfferDraft(draft)).toEqual({
      ok: true,
      data: { amountCents: 3_850_050, conditions: 'Pago a 15 días' },
    });
  });

  it('reports the amount under the field name of the form', () => {
    for (const amount of ['', 'abc', '0', '12.345']) {
      const result = parseOfferDraft({ ...draft, amount });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.amount).toBeTruthy();
    }
  });

  it('formats cents for the amount field', () => {
    expect(centsToPesosInput(3_850_000)).toBe('38500');
    expect(centsToPesosInput(3_850_050)).toBe('38500.50');
  });
});

const row = {
  load_id: 'load-1',
  company_id: 'c1',
  vehicle_id: 'unit-1',
  availability_id: null,
  start_city: 'Guadalajara',
  start_state: 'Jalisco',
  start_lat: 20.628,
  start_lng: -103.356,
  available_from: '2099-10-20T14:00:00Z',
  is_return_trip: true,
  origin_city: 'Guadalajara',
  origin_state: 'Jalisco',
  origin_lat: 20.656,
  origin_lng: -103.391,
  destination_city: 'Monterrey',
  destination_state: 'Nuevo León',
  destination_lat: 25.724,
  destination_lng: -100.201,
  pickup_window_start: '2099-10-20T16:00:00Z',
  pickup_window_end: '2099-10-21T18:00:00Z',
  unit_type: 'dry_van',
  weight_kg: 18000,
  proposed_price_cents: 3_900_000,
  empty_km: 4.8,
  home_distance_km: 14.1,
  route_origin_city: 'Guadalajara',
  route_destination_city: 'Monterrey',
};

function fakeClient({
  invoke,
  rpc,
}: {
  invoke: () => Promise<{ data: unknown; error: unknown }>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}) {
  return { functions: { invoke: vi.fn(invoke) }, rpc: vi.fn(rpc) } as unknown as Supabase & {
    functions: { invoke: ReturnType<typeof vi.fn> };
    rpc: ReturnType<typeof vi.fn>;
  };
}

describe('unitRecommendations', () => {
  it('uses the Edge Function when it answers', async () => {
    const recommendations = [{ loadId: 'load-1' }];
    const client = fakeClient({
      invoke: () => Promise.resolve({ data: { recommendations }, error: null }),
      rpc: () => Promise.reject(new Error('not called')),
    });
    await expect(unitRecommendations(client, 'unit-1')).resolves.toEqual({
      vehicleId: 'unit-1',
      recommendations,
    });
    expect(client.functions.invoke).toHaveBeenCalledWith('recommendations', {
      body: { vehicleId: 'unit-1', limit: 10 },
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('scores match_candidates locally when the function is not reachable', async () => {
    const client = fakeClient({
      invoke: () => Promise.resolve({ data: null, error: new Error('FunctionsFetchError') }),
      rpc: () => Promise.resolve({ data: [row], error: null }),
    });
    const result = await unitRecommendations(client, 'unit-1');
    expect(client.rpc).toHaveBeenCalledWith('match_candidates', {
      p_vehicle_id: 'unit-1',
      p_limit: 200,
    });
    const [first] = result.recommendations;
    expect(first?.loadId).toBe('load-1');
    expect(first?.breakdown.isReturnTrip).toBe(true);
    expect(first?.breakdown.distanceSource).toBe('estimate');
    expect(first?.explanation).toContain('coincide con tu ruta GDL–MTY');
  });

  it('propagates authorization errors of the fallback', async () => {
    const denied = { code: '42501', message: 'company is not approved' };
    const client = fakeClient({
      invoke: () => Promise.resolve({ data: null, error: new Error('403') }),
      rpc: () => Promise.resolve({ data: null, error: denied }),
    });
    await expect(unitRecommendations(client, 'unit-1')).rejects.toBe(denied);
  });
});

describe('emptyLegs', () => {
  const unit = (id: string): CarrierUnit => ({
    id,
    plate: `P-${id}`,
    fleet_number: null,
    unit_type: 'dry_van',
    kind: 'rigid',
  });

  it('keeps the compatible units, nearest first, with estimated road km', async () => {
    const client = fakeClient({
      invoke: () => Promise.reject(new Error('not called')),
      rpc: (_fn, args) => {
        if (args.p_vehicle_id === 'far') {
          return Promise.resolve({
            data: [{ ...row, vehicle_id: 'far', empty_km: 100 }],
            error: null,
          });
        }
        if (args.p_vehicle_id === 'not-ready')
          return Promise.resolve({ data: null, error: { code: '42501' } });
        if (args.p_vehicle_id === 'other') {
          return Promise.resolve({ data: [{ ...row, load_id: 'load-2' }], error: null });
        }
        return Promise.resolve({ data: [row], error: null });
      },
    });
    const legs = await emptyLegs(client, 'load-1', ['far', 'near', 'not-ready', 'other'].map(unit));
    expect(legs.map((l) => l.vehicleId)).toEqual(['near', 'far']);
    expect(legs[0]?.emptyKm).toBeCloseTo(4.8 * 1.3);
    expect(legs[0]?.start).toEqual({ city: 'Guadalajara', lat: 20.628, lng: -103.356 });
  });

  it('names units by fleet number, else plate', () => {
    expect(unitLabel({ fleet_number: 'CS53-01', plate: 'ABC' })).toBe('CS53-01');
    expect(unitLabel({ fleet_number: null, plate: 'ABC' })).toBe('ABC');
  });
});
