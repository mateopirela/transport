// deno test supabase/functions/issue-client-cfdi — Edge Function
// `issue-client-cfdi` (I5) with simulated Auth, PostgREST and Storage (no
// network, no keys): the `manual` provider by default, the admin's upload.
import assert from 'node:assert/strict';

import { syntheticCfdi } from '../../../packages/shared/src/freight/cfdi-fixtures.ts';
import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import type { UploadDependencies } from '../_shared/cfdi-upload.ts';
import { handleIssueClientCfdi } from './handler.ts';
import { cfdiProviderFromEnv, manualProvider } from './provider.ts';

const USER = 'a3500000-0000-4000-8000-000000000001';
const TRIP = 'b3500000-0000-4000-8000-000000000001';
const INVOICE = 'c3500000-0000-4000-8000-000000000001';
const OBJECT = 'd3500000-0000-4000-8000-000000000001';

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(env: Record<string, string | undefined> = {}) {
  const urls: string[] = [];
  const bodies: Record<string, unknown> = {};
  const lines: string[] = [];
  const values: Record<string, string | undefined> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...env,
  };
  const deps: UploadDependencies = {
    env: (name) => values[name],
    log: createLogger({ service: 'test', sink: (_level, line) => lines.push(line) }),
    randomUUID: () => OBJECT,
    fetch: async (url, init) => {
      urls.push(url);
      if (typeof init.body === 'string') bodies[url] = JSON.parse(init.body);
      if (url.endsWith('/auth/v1/user')) return ok({ id: USER });
      if (url.endsWith('/rpc/consume_rate_limit')) return ok(0);
      if (url.endsWith('/rpc/check_freight_invoice_service')) {
        return ok({ failures: [], validation: 'validated' });
      }
      if (url.endsWith('/rpc/record_freight_invoice_service')) {
        return ok({ invoiceId: INVOICE, validation: 'validated' });
      }
      if (url.includes('/storage/v1/object/invoices/')) return ok({ Key: 'x' });
      throw new Error(`unexpected ${url}`);
    },
  };
  return { deps, urls, bodies, lines };
}

function upload(pdf: boolean): Request {
  const form = new FormData();
  form.set('tripId', TRIP);
  form.set(
    'xml',
    new File([syntheticCfdi({ issuerRfc: 'FUL201015AB1', receiverRfc: 'ADN150301KQ2' })], 'f.xml'),
  );
  if (pdf) form.set('pdf', new File([new TextEncoder().encode('%PDF-1.4\n')], 'f.pdf'));
  return new Request('http://functions.test/issue-client-cfdi', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-jwt' },
    body: form,
  });
}

Deno.test('with the manual provider the admin uploads the CFDI issued elsewhere', async () => {
  const { deps, urls, bodies } = setup();
  const response = await handleIssueClientCfdi(upload(true), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { invoiceId: INVOICE, validation: 'validated' });
  assert.ok(
    urls.includes(
      `http://supabase.test/storage/v1/object/invoices/${TRIP}/fulmis_to_client/${OBJECT}.pdf`,
    ),
  );
  const record = bodies[
    'http://supabase.test/rest/v1/rpc/record_freight_invoice_service'
  ] as Record<string, unknown>;
  assert.equal(record.p_direction, 'fulmis_to_client');
  assert.equal(record.p_provider, 'manual');
  assert.equal(record.p_receiver_rfc, 'ADN150301KQ2');
});

Deno.test('the client downloads Fulmis invoice: its PDF is required', async () => {
  const { deps, urls } = setup();
  const response = await handleIssueClientCfdi(upload(false), deps);
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).failures, ['pdf_missing']);
  assert.ok(!urls.some((url) => url.includes('/storage/')));
});

Deno.test('issuing from the platform is off without a PAC', async () => {
  const { deps, urls } = setup();
  const response = await handleIssueClientCfdi(
    new Request('http://functions.test/issue-client-cfdi', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: TRIP }),
    }),
    deps,
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'manual_provider' });
  assert.equal(urls.length, 0);

  const anonymous = await handleIssueClientCfdi(
    new Request('http://functions.test/issue-client-cfdi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    deps,
  );
  assert.equal(anonymous.status, 401);
});

Deno.test('the provider is manual unless a known PAC and its key are set', async () => {
  const lines: string[] = [];
  const log = createLogger({ service: 'test', sink: (_level, line) => lines.push(line) });
  assert.equal(
    cfdiProviderFromEnv(() => undefined, log),
    manualProvider,
  );
  assert.equal(
    cfdiProviderFromEnv((name) => (name === 'CFDI_PROVIDER' ? 'manual' : undefined), log),
    manualProvider,
  );
  const env: Record<string, string> = { CFDI_PROVIDER: 'some-pac', CFDI_API_KEY: 'secret-key' };
  assert.equal(
    cfdiProviderFromEnv((name) => env[name], log),
    manualProvider,
  );
  assert.ok(lines.join('\n').includes('unknown_provider'));
  assert.ok(!lines.join('\n').includes('secret-key'));

  assert.deepEqual(await manualProvider.issue({ tripId: TRIP }), { status: 'manual' });
  assert.deepEqual(await manualProvider.cancel('x', 'y'), { status: 'manual' });
  assert.equal(await manualProvider.getPdf('x'), null);
  assert.equal(await manualProvider.getXml('x'), null);
});
