// deno test supabase/functions — Edge Function `recommendations` (B08) with
// simulated Supabase and Google Routes (no network, no keys).
import assert from 'node:assert/strict';
import { handleRecommendations, type Dependencies } from './handler.ts';

const VEHICLE = '5eed0004-0000-4000-8000-000000000002';
const NOW = new Date('2026-10-20T12:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const row = (loadId: string, overrides: Record<string, unknown> = {}) => ({
  load_id: loadId,
  company_id: 'c1',
  vehicle_id: VEHICLE,
  availability_id: null,
  start_city: 'Guadalajara',
  start_state: 'Jalisco',
  start_lat: 20.628,
  start_lng: -103.356,
  available_from: at(2),
  is_return_trip: true,
  origin_city: 'Guadalajara',
  origin_state: 'Jalisco',
  origin_lat: 20.656,
  origin_lng: -103.391,
  destination_city: 'Monterrey',
  destination_state: 'Nuevo León',
  destination_lat: 25.724,
  destination_lng: -100.201,
  pickup_window_start: at(4),
  pickup_window_end: at(30),
  unit_type: 'dry_van',
  weight_kg: 18000,
  proposed_price_cents: 3_900_000,
  empty_km: 4.8,
  home_distance_km: 14.1,
  route_origin_city: 'Guadalajara',
  route_destination_city: 'Monterrey',
  ...overrides,
});

interface Call {
  url: string;
  init: RequestInit;
}

function setup(options: {
  env?: Record<string, string>;
  rpc?: () => Response;
  cacheRows?: unknown[];
}) {
  const calls: Call[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon-key',
    ...options.env,
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    now: () => NOW,
    fetch: (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/rpc/match_candidates')) {
        return Promise.resolve(
          options.rpc?.() ?? Response.json([row('far', { origin_lat: 20.9 }), row('near')]),
        );
      }
      if (url.endsWith('/rpc/get_route_distances'))
        return Promise.resolve(Response.json(options.cacheRows ?? []));
      if (url.endsWith('/rpc/put_route_distances'))
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url.startsWith('https://routes.googleapis.com/')) {
        return Promise.resolve(
          Response.json({ routes: [{ distanceMeters: 800_000, duration: '32400s' }] }),
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    },
  };
  return { calls, deps };
}

const post = (
  body: unknown,
  headers: Record<string, string> = { Authorization: 'Bearer user-jwt' },
) =>
  new Request('http://functions.test/recommendations', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

Deno.test('answers CORS preflight and rejects other methods', async () => {
  const { deps } = setup({});
  assert.equal(
    (await handleRecommendations(new Request('http://x', { method: 'OPTIONS' }), deps)).status,
    204,
  );
  assert.equal((await handleRecommendations(new Request('http://x'), deps)).status, 405);
});

Deno.test('requires the caller JWT and a valid body', async () => {
  const { deps, calls } = setup({});
  assert.equal((await handleRecommendations(post({ vehicleId: VEHICLE }, {}), deps)).status, 401);
  for (const body of [
    'not json',
    [],
    {},
    { vehicleId: 'x' },
    { vehicleId: VEHICLE, availabilityId: VEHICLE },
    { vehicleId: VEHICLE, limit: 50 },
    { vehicleId: VEHICLE, maxEmptyKm: 0 },
  ]) {
    assert.equal((await handleRecommendations(post(body), deps)).status, 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
});

Deno.test('fails closed without Supabase configuration', async () => {
  const { deps } = setup({ env: { SUPABASE_URL: '' } });
  assert.equal((await handleRecommendations(post({ vehicleId: VEHICLE }), deps)).status, 500);
});

Deno.test('maps match_candidates errors', async () => {
  const cases: [Response, number][] = [
    [Response.json({ code: '42501' }, { status: 403 }), 403],
    [Response.json({ code: '22023' }, { status: 400 }), 400],
    [Response.json({ code: 'PGRST301' }, { status: 401 }), 401],
    [new Response('boom', { status: 500 }), 502],
  ];
  const errors = console.error;
  console.error = () => {};
  try {
    for (const [response, status] of cases) {
      const { deps } = setup({ rpc: () => response });
      assert.equal(
        (await handleRecommendations(post({ vehicleId: VEHICLE }), deps)).status,
        status,
      );
    }
  } finally {
    console.error = errors;
  }
});

Deno.test('ranks with estimates and never calls Google without a key', async () => {
  const { deps, calls } = setup({});
  const response = await handleRecommendations(post({ vehicleId: VEHICLE, maxEmptyKm: 100 }), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.candidates, 2);
  assert.deepEqual(
    body.recommendations.map((r: { loadId: string }) => r.loadId),
    ['near', 'far'],
  );
  assert.equal(body.recommendations[0].breakdown.distanceSource, 'estimate');
  assert.match(
    body.recommendations[0].explanation,
    /en vacío · \$\d+\/km · .* · coincide con tu ruta GDL–MTY/u,
  );

  const rpc = calls[0]!;
  assert.equal((rpc.init.headers as Record<string, string>).Authorization, 'Bearer user-jwt');
  assert.deepEqual(JSON.parse(String(rpc.init.body)), {
    p_vehicle_id: VEHICLE,
    p_availability_id: null,
    p_max_empty_km: 100,
    p_limit: 200,
  });
  assert.equal(calls.filter((c) => c.url.includes('googleapis')).length, 0);
});

Deno.test(
  'with a key: cache first, Routes only for the misses of the top N, then stored',
  async () => {
    const { deps, calls } = setup({
      env: { SUPABASE_SERVICE_ROLE_KEY: 'service-jwt', GOOGLE_ROUTES_API_KEY: 'routes-key' },
      // The empty leg of `near` is cached.
      cacheRows: [
        {
          origin_lat: 20.63,
          origin_lng: -103.36,
          destination_lat: 20.66,
          destination_lng: -103.39,
          distance_km: 7.5,
          duration_minutes: 15,
        },
      ],
    });
    const response = await handleRecommendations(post({ vehicleId: VEHICLE, limit: 1 }), deps);
    const body = await response.json();
    assert.equal(body.recommendations.length, 1);
    const [best] = body.recommendations;
    assert.equal(best.loadId, 'near');
    assert.equal(best.breakdown.emptyKm, 7.5);
    assert.equal(best.breakdown.loadedKm, 800);
    assert.equal(best.breakdown.distanceSource, 'routes');

    const google = calls.filter((c) => c.url.includes('googleapis'));
    assert.equal(google.length, 1, 'top 1: one leg cached, one fetched');
    assert.equal(
      (google[0]!.init.headers as Record<string, string>)['X-Goog-Api-Key'],
      'routes-key',
    );
    const cacheCall = calls.find((c) => c.url.endsWith('/rpc/get_route_distances'))!;
    assert.equal(
      (cacheCall.init.headers as Record<string, string>).Authorization,
      'Bearer service-jwt',
    );
    const put = calls.find((c) => c.url.endsWith('/rpc/put_route_distances'))!;
    assert.deepEqual(JSON.parse(String(put.init.body)).p_legs, [
      {
        originLat: 20.66,
        originLng: -103.39,
        destinationLat: 25.72,
        destinationLng: -100.2,
        distanceKm: 800,
        durationMinutes: 540,
      },
    ]);
  },
);

Deno.test('new secret keys go only in the apikey header', async () => {
  const { deps, calls } = setup({ env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' } });
  await handleRecommendations(post({ vehicleId: VEHICLE }), deps);
  const headers = calls.find((c) => c.url.endsWith('/rpc/get_route_distances'))!.init
    .headers as Record<string, string>;
  assert.equal(headers.apikey, 'sb_secret_x');
  assert.equal(headers.Authorization, undefined);
});
