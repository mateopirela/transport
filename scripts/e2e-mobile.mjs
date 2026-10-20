#!/usr/bin/env node
// End-to-end flows of the mobile app (F14): runs the Maestro flows of
// apps/mobile/.maestro in order against the local Supabase with the demo seed,
// and between them does what the app cannot:
//   - the shipper accepts the carrier's offer (the web does it with the same RPC),
//   - a trip of TT-01 sets off and the shipper cancels it (G5), so the
//     coordinator has a unit to release,
//   - G9: Héctor assigns Iván Garza (phone only) a trip of RF53-01; Sofía
//     publishes a load for the hombre-camión and accepts his offer,
//   - the API goes down and up again around the offline flow (the iOS
//     simulator shares the Mac's network, so the app is cut off from the
//     server by stopping the local API gateway, the Kong container).
// Screenshots of every step end up in <output>/screenshots.
//
//   pnpm e2e:mobile                          # reset the seed, run everything
//   pnpm e2e:mobile --no-reset               # on the current data
//   pnpm e2e:mobile --from 05-operator-pickup
//
// Environment (see apps/mobile/.maestro/README.md):
//   MAESTRO_DEVICE   simulator/emulator id (`xcrun simctl list devices`); default: the only one booted
//   METRO_URL        Metro as the device reaches it (default http://127.0.0.1:8081)
//   APP_ID           bundle id (default mx.transport.app)
//   E2E_MOBILE_OUTPUT  output folder (default e2e/mobile-results)
//   MAESTRO_BIN      Maestro CLI (default `maestro`)
//   SUPABASE_PROJECT_ID and the SUPABASE_*_PORT variables of scripts/local-ports.sh, as for `supabase start`.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flowsDir = join(root, 'apps/mobile/.maestro');

// Seed (supabase/seed.sql): the GDL -> MTY load that CS53-01 wins as its return trip.
const RETURN_TRIP_LOAD = '5eed0005-0000-4000-8000-000000000002';
const SHIPPER = 'luis.ramirez@demo.test';
const DEMO_PASSWORD = 'Demo1234';
// G5: Héctor's torton TT-01 and Raúl Méndez ("Regional Monterrey"), for Sofía's load.
const RELEASE_SHIPPER = 'sofia.trevino@demo.test';
const RELEASE_COORDINATOR = 'hector.ibarra@demo.test';
const RELEASE_OPERATOR = 'raul.mendez@demo.test';
const TORTON = '5eed0004-0000-4000-8000-000000000004';
const RAUL = '5eed0003-0000-4000-8000-000000000002';
// G9: Iván Garza (phone only, "Regional Monterrey") gets a trip of RF53-01, and
// the hombre-camión José Sánchez (JSM-01) offers on a load of his own.
const REEFER = '5eed0004-0000-4000-8000-000000000003';
const IVAN = '5eed0003-0000-4000-8000-000000000007';
const OWNER_OPERATOR_LOAD = 'Rollos de cartón (E2E G9, hombre-camión)';

const args = process.argv.slice(2);
const reset = !args.includes('--no-reset');
const fromIndex = args.indexOf('--from');
const from = fromIndex >= 0 ? args[fromIndex + 1] : undefined;

const metroUrl = process.env.METRO_URL || 'http://127.0.0.1:8081';
const appId = process.env.APP_ID || 'mx.transport.app';
const output = resolve(root, process.env.E2E_MOBILE_OUTPUT || 'e2e/mobile-results');
const maestro = process.env.MAESTRO_BIN || 'maestro';
const device = process.env.MAESTRO_DEVICE;

// A stuck simulator driver must not hang the run forever.
const STEP_TIMEOUT_MS = 15 * 60 * 1000;

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    timeout: STEP_TIMEOUT_MS,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed`);
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed`);
  return result.stdout;
}

/** API URL and anon key of the running stack (`supabase status -o env`). */
function supabaseStatus() {
  const values = Object.fromEntries(
    capture('supabase', ['status', '-o', 'env'])
      .split('\n')
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/u.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  if (!values.API_URL || !values.ANON_KEY)
    throw new Error('supabase status has no API_URL/ANON_KEY');
  return { apiUrl: values.API_URL, anonKey: values.ANON_KEY };
}

/** Docker container of the API gateway: supabase_kong_<project id>. */
function gatewayContainer() {
  let projectId = process.env.SUPABASE_PROJECT_ID;
  if (!projectId) {
    const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
    projectId = /^project_id\s*=\s*"([^"]+)"/mu.exec(config)?.[1];
  }
  if (!projectId) throw new Error('no Supabase project id');
  return `supabase_kong_${projectId}`;
}

/**
 * fetch, retried a few times when the connection itself fails (never on an
 * HTTP error). Only for requests that are safe to repeat: a write whose
 * response is lost could otherwise run twice (a second load, a second offer).
 */
async function fetchWithRetry(url, init, { retry }) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (!retry || attempt >= 5) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** Reads and the password sign-in change nothing, so a retry cannot duplicate anything. */
function safeToRepeat(path, body) {
  return body === undefined || path.startsWith('/auth/v1/token?grant_type=password');
}

async function api(status, path, { token, body } = {}) {
  const response = await fetchWithRetry(
    `${status.apiUrl}${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        apikey: status.anonKey,
        authorization: `Bearer ${token ?? status.anonKey}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { retry: safeToRepeat(path, body) },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** The shipper accepts the carrier's pending offer on the return trip (accept_offer). */
async function shipperAccepts(status) {
  const session = await api(status, '/auth/v1/token?grant_type=password', {
    body: { email: SHIPPER, password: DEMO_PASSWORD },
  });
  const offers = await api(
    status,
    `/rest/v1/offers?select=id&load_id=eq.${RETURN_TRIP_LOAD}&side=eq.carrier&status=eq.pending`,
    { token: session.access_token },
  );
  if (offers.length !== 1) throw new Error(`expected 1 pending offer, got ${offers.length}`);
  await api(status, '/rest/v1/rpc/accept_offer', {
    token: session.access_token,
    body: { p_offer_id: offers[0].id },
  });
  console.log(`${SHIPPER} accepted the offer on the return trip.`);
}

async function signIn(status, email) {
  const session = await api(status, '/auth/v1/token?grant_type=password', {
    body: { email, password: DEMO_PASSWORD },
  });
  return session.access_token;
}

/**
 * G5: Sofía publishes a MTY → Apodaca torton load, Héctor offers TT-01, she
 * accepts, he assigns Raúl, Raúl sets off and Sofía cancels the trip: TT-01
 * waits for Héctor to release it (10-coordinator-release.yaml).
 */
async function tripCancelledOnTheWay(status) {
  const [shipper, coordinator, operator] = await Promise.all(
    [RELEASE_SHIPPER, RELEASE_COORDINATOR, RELEASE_OPERATOR].map((email) => signIn(status, email)),
  );
  const at = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
  const loadId = await api(status, '/rest/v1/rpc/create_load', {
    token: shipper,
    body: {
      p_load: {
        origin: {
          address: 'Av. Constitución 100',
          city: 'Monterrey',
          state: 'Nuevo León',
          lat: 25.6866,
          lng: -100.3161,
        },
        destination: {
          address: 'Carretera Miguel Alemán 500',
          city: 'Apodaca',
          state: 'Nuevo León',
          lat: 25.7817,
          lng: -100.1886,
        },
        pickupWindow: { start: at(2), end: at(6) },
        deliveryWindow: { start: at(8), end: at(12) },
        cargoType: 'palletized',
        description: 'Tarimas (E2E G5)',
        weightKg: 9000,
        unitType: 'torton',
        specialRequirements: [],
        proposedPriceCents: 1_200_000,
      },
    },
  });
  await api(status, '/rest/v1/rpc/publish_load', { token: shipper, body: { p_load_id: loadId } });
  const offerId = await api(status, '/rest/v1/rpc/make_offer', {
    token: coordinator,
    body: { p_load_id: loadId, p_amount_cents: 1_200_000, p_vehicle_id: TORTON },
  });
  const tripId = await api(status, '/rest/v1/rpc/accept_offer', {
    token: shipper,
    body: { p_offer_id: offerId },
  });
  await api(status, '/rest/v1/rpc/assign_trip', {
    token: coordinator,
    body: { p_trip_id: tripId, p_vehicle_id: TORTON, p_operator_id: RAUL },
  });
  await api(status, '/rest/v1/rpc/record_trip_event', {
    token: operator,
    body: {
      p_trip_id: tripId,
      p_event_type: 'departed',
      p_occurred_at: new Date().toISOString(),
      p_latitude: 25.6866,
      p_longitude: -100.3161,
    },
  });
  await api(status, '/rest/v1/rpc/cancel_trip', {
    token: shipper,
    body: { p_trip_id: tripId, p_reason_code: 'shipper_request', p_notes: '' },
  });
  console.log(
    `${RELEASE_SHIPPER} cancelled the TT-01 trip on its way: TT-01 waits for its release.`,
  );
}

/** A published load of Sofía (Empaques Plásticos Regios), Monterrey → Saltillo. */
async function sofiaPublishes(status, shipper, { unitType, description, startsIn }) {
  const at = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
  const loadId = await api(status, '/rest/v1/rpc/create_load', {
    token: shipper,
    body: {
      p_load: {
        origin: {
          address: 'Av. Constitución 100',
          city: 'Monterrey',
          state: 'Nuevo León',
          lat: 25.6866,
          lng: -100.3161,
        },
        destination: {
          address: 'Blvd. Venustiano Carranza 2000',
          city: 'Saltillo',
          state: 'Coahuila',
          lat: 25.4383,
          lng: -100.9737,
        },
        pickupWindow: { start: at(startsIn), end: at(startsIn + 4) },
        deliveryWindow: { start: at(startsIn + 6), end: at(startsIn + 10) },
        cargoType: 'palletized',
        description,
        weightKg: 8000,
        unitType,
        specialRequirements: [],
        proposedPriceCents: 900_000,
      },
    },
  });
  await api(status, '/rest/v1/rpc/publish_load', { token: shipper, body: { p_load_id: loadId } });
  return loadId;
}

/**
 * G9: Sofía publishes a refrigerated Monterrey → Saltillo load, Héctor offers
 * RF53-01, she accepts and he assigns Iván Garza, the operator who signs in
 * with his phone (12-operator-phone.yaml).
 */
async function tripForIvan(status) {
  const [shipper, coordinator] = await Promise.all(
    [RELEASE_SHIPPER, RELEASE_COORDINATOR].map((email) => signIn(status, email)),
  );
  const loadId = await sofiaPublishes(status, shipper, {
    unitType: 'refrigerated',
    description: 'Lácteos refrigerados (E2E G9)',
    startsIn: 8,
  });
  const offerId = await api(status, '/rest/v1/rpc/make_offer', {
    token: coordinator,
    body: { p_load_id: loadId, p_amount_cents: 900_000, p_vehicle_id: REEFER },
  });
  const tripId = await api(status, '/rest/v1/rpc/accept_offer', {
    token: shipper,
    body: { p_offer_id: offerId },
  });
  await api(status, '/rest/v1/rpc/assign_trip', {
    token: coordinator,
    body: { p_trip_id: tripId, p_vehicle_id: REEFER, p_operator_id: IVAN },
  });
  console.log(`${RELEASE_COORDINATOR} assigned RF53-01 and Iván Garza to Sofía's trip.`);
}

/** G9: a torton load for the hombre-camión's JSM-01 (available in 12 hours). */
async function ownerOperatorLoad(status) {
  const shipper = await signIn(status, RELEASE_SHIPPER);
  await sofiaPublishes(status, shipper, {
    unitType: 'torton',
    description: OWNER_OPERATOR_LOAD,
    startsIn: 14,
  });
  console.log(`${RELEASE_SHIPPER} published the Monterrey → Saltillo load for JSM-01.`);
}

/** G9: Sofía accepts José's offer on that load (13-owner-operator-offer.yaml). */
async function shipperAcceptsOwnerOperator(status) {
  const shipper = await signIn(status, RELEASE_SHIPPER);
  const loads = await api(
    status,
    `/rest/v1/loads?select=id&description=eq.${encodeURIComponent(OWNER_OPERATOR_LOAD)}`,
    { token: shipper },
  );
  if (loads.length !== 1) throw new Error(`expected 1 hombre-camión load, got ${loads.length}`);
  const offers = await api(
    status,
    `/rest/v1/offers?select=id&load_id=eq.${loads[0].id}&side=eq.carrier&status=eq.pending`,
    { token: shipper },
  );
  if (offers.length !== 1) throw new Error(`expected 1 pending offer, got ${offers.length}`);
  await api(status, '/rest/v1/rpc/accept_offer', {
    token: shipper,
    body: { p_offer_id: offers[0].id },
  });
  console.log(`${RELEASE_SHIPPER} accepted the hombre-camión's offer.`);
}

function apiDown() {
  run('docker', ['stop', gatewayContainer()]);
  console.log('API gateway stopped: the app is offline.');
}

async function apiUp(status) {
  run('docker', ['start', gatewayContainer()]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${status.apiUrl}/auth/v1/health`, {
        headers: { apikey: status.anonKey },
      });
      if (response.ok) {
        console.log('API gateway is back.');
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('the API did not come back');
}

function flow(name) {
  const devClientUrl = `exp+transport://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;
  run(maestro, [
    ...(device ? ['--device', device] : []),
    'test',
    '-e',
    `APP_ID=${appId}`,
    '-e',
    `DEV_CLIENT_URL=${devClientUrl}`,
    '--test-output-dir',
    join(output, 'maestro', name),
    join(flowsDir, `${name}.yaml`),
  ]);
}

/** Copies every screenshot the flows took to <output>/screenshots. */
function collectScreenshots() {
  const target = join(output, 'screenshots');
  mkdirSync(target, { recursive: true });
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (dir.endsWith('takeScreenshot') && entry.endsWith('.png')) {
        copyFileSync(path, join(target, entry));
      }
    }
  };
  if (existsSync(join(output, 'maestro'))) walk(join(output, 'maestro'));
  console.log(`Screenshots: ${target}`);
}

// `needs`: the step that sets up what a flow expects, run first when the run
// starts at that flow (--from).
const steps = [
  // H4: reads the tolls and the suggested road of the return trip before 01 offers on it.
  { name: '18-carrier-road', run: () => flow('18-carrier-road') },
  { name: '01-carrier-offer', run: () => flow('01-carrier-offer') },
  { name: 'shipper-accepts', run: (status) => shipperAccepts(status) },
  { name: '02-operator-unloading', run: () => flow('02-operator-unloading') },
  { name: '03-carrier-assign', run: () => flow('03-carrier-assign') },
  { name: '04-carrier-counteroffer', run: () => flow('04-carrier-counteroffer') },
  { name: '05-operator-pickup', run: () => flow('05-operator-pickup') },
  { name: 'api-down', run: () => apiDown() },
  {
    name: '06-operator-incident-offline',
    needs: 'api-down',
    run: () => flow('06-operator-incident-offline'),
  },
  { name: 'api-up', run: (status) => apiUp(status) },
  { name: '07-operator-delivery', run: () => flow('07-operator-delivery') },
  { name: '08-operator-invite', run: () => flow('08-operator-invite') },
  // G5 before G4: Héctor's TT-01 trip (and Raúl) are in "Regional Monterrey";
  // 09 moves TT-01 to "Bajío" once it is released.
  { name: 'trip-cancelled-on-the-way', run: (status) => tripCancelledOnTheWay(status) },
  {
    name: '10-coordinator-release',
    needs: 'trip-cancelled-on-the-way',
    run: () => flow('10-coordinator-release'),
  },
  { name: '09-manager-company', run: () => flow('09-manager-company') },
  { name: '11-coordinator-isolation', run: () => flow('11-coordinator-isolation') },
  { name: 'trip-for-ivan', run: (status) => tripForIvan(status) },
  { name: '12-operator-phone', needs: 'trip-for-ivan', run: () => flow('12-operator-phone') },
  { name: 'owner-operator-load', run: (status) => ownerOperatorLoad(status) },
  {
    name: '13-owner-operator-offer',
    needs: 'owner-operator-load',
    run: () => flow('13-owner-operator-offer'),
  },
  { name: 'owner-operator-accepted', run: (status) => shipperAcceptsOwnerOperator(status) },
  {
    name: '14-owner-operator-trip',
    needs: 'owner-operator-accepted',
    run: () => flow('14-owner-operator-trip'),
  },
];

let start = from ? steps.findIndex((s) => s.name === from) : 0;
if (start < 0) throw new Error(`unknown step ${from}: ${steps.map((s) => s.name).join(', ')}`);
const needs = steps[start]?.needs;
if (needs) start = steps.findIndex((s) => s.name === needs);
const pending = steps.slice(start);

// Results of the steps about to run are replaced, never mixed with an older run.
rmSync(join(output, 'screenshots'), { recursive: true, force: true });
for (const step of pending)
  rmSync(join(output, 'maestro', step.name), { recursive: true, force: true });

/** Starts the gateway again if a step left it stopped. Synchronous: also runs on signals. */
function restoreGateway() {
  const gateway = gatewayContainer();
  const running = capture('docker', ['inspect', '-f', '{{.State.Running}}', gateway]).trim();
  if (running === 'true') return false;
  run('docker', ['start', gateway]);
  return true;
}

// Ctrl-C or a kill during the offline flow must not leave the local API down.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      if (restoreGateway()) console.log('API gateway started again.');
    } finally {
      process.exit(130);
    }
  });
}

if (reset) run('supabase', ['db', 'reset']);
const status = supabaseStatus();
let failed = false;
try {
  for (const step of pending) {
    console.log(`\n=== ${step.name}`);
    await step.run(status);
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  // Never leave the local API down.
  if (restoreGateway()) await apiUp(status);
  collectScreenshots();
}
process.exit(failed ? 1 : 0);
