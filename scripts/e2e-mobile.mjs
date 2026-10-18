#!/usr/bin/env node
// End-to-end flows of the mobile app (F14): runs the Maestro flows of
// apps/mobile/.maestro in order against the local Supabase with the demo seed,
// and between them does what the app cannot:
//   - the shipper accepts the carrier's offer (the web does it with the same RPC),
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

async function api(status, path, { token, body } = {}) {
  const response = await fetch(`${status.apiUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: status.anonKey,
      authorization: `Bearer ${token ?? status.anonKey}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
