// deno test supabase/functions/validate-carrier-cfdi — Edge Function
// `validate-carrier-cfdi` (I5) with simulated Auth, PostgREST and Storage (no
// network, no keys). The shared steps live in ../_shared/cfdi-upload.ts.
import assert from 'node:assert/strict';

import {
  SYNTHETIC_UUID,
  syntheticCfdi,
} from '../../../packages/shared/src/freight/cfdi-fixtures.ts';
import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import { MAX_BODY_BYTES, type UploadDependencies } from '../_shared/cfdi-upload.ts';
import { handleValidateCarrierCfdi } from './handler.ts';

const USER = 'a3400000-0000-4000-8000-000000000001';
const TRIP = 'b3400000-0000-4000-8000-000000000001';
const INVOICE = 'c3400000-0000-4000-8000-000000000001';
const OBJECT = 'd3400000-0000-4000-8000-000000000001';
const PDF = new TextEncoder().encode('%PDF-1.7\n%synthetic\n');

interface Call {
  url: string;
  init: RequestInit;
}

type Answer = () => Response | Promise<Response>;

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(
  options: {
    env?: Record<string, string | undefined>;
    user?: Answer;
    rateLimit?: Answer;
    check?: Answer;
    upload?: Answer;
    record?: Answer;
    remove?: Answer;
  } = {},
) {
  const calls: Call[] = [];
  const lines: string[] = [];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...options.env,
  };
  const deps: UploadDependencies = {
    env: (name) => env[name],
    log: createLogger({ service: 'test', sink: (_level, line) => lines.push(line) }),
    randomUUID: () => OBJECT,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/v1/user')) return (options.user ?? (() => ok({ id: USER })))();
      if (url.endsWith('/rpc/consume_rate_limit')) return (options.rateLimit ?? (() => ok(0)))();
      if (url.endsWith('/rpc/check_freight_invoice_service')) {
        return (options.check ?? (() => ok({ failures: [], validation: 'unvalidated' })))();
      }
      if (url.endsWith('/rpc/record_freight_invoice_service')) {
        return (options.record ?? (() => ok({ invoiceId: INVOICE, validation: 'unvalidated' })))();
      }
      if (url.endsWith('/storage/v1/object/invoices') && init.method === 'DELETE') {
        return (options.remove ?? (() => ok([])))();
      }
      if (url.includes('/storage/v1/object/invoices/')) {
        return (options.upload ?? (() => ok({ Key: 'invoices/x' })))();
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  return { deps, calls, lines };
}

function request(
  parts: { tripId?: string; xml?: string | null; pdf?: Uint8Array<ArrayBuffer> | null } = {},
  init: { authorization?: string | null } = {},
): Request {
  const form = new FormData();
  if (parts.tripId !== undefined || !('tripId' in parts)) form.set('tripId', parts.tripId ?? TRIP);
  const xml = parts.xml === undefined ? syntheticCfdi() : parts.xml;
  if (xml !== null) form.set('xml', new File([xml], 'cfdi.xml', { type: 'application/xml' }));
  const pdf = parts.pdf === undefined ? PDF : parts.pdf;
  if (pdf !== null) form.set('pdf', new File([pdf], 'cfdi.pdf', { type: 'application/pdf' }));
  const headers: Record<string, string> = {};
  if (init.authorization !== null) headers.Authorization = init.authorization ?? 'Bearer user-jwt';
  return new Request('http://functions.test/validate-carrier-cfdi', {
    method: 'POST',
    headers,
    body: form,
  });
}

function called(calls: Call[], suffix: string): Call[] {
  return calls.filter((call) => call.url.endsWith(suffix));
}

Deno.test('registers a valid CFDI: checks, stores both files and records them', async () => {
  const { deps, calls, lines } = setup();
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { invoiceId: INVOICE, validation: 'unvalidated' });

  // The user comes from the JWT; the rate limit runs with the user's JWT.
  const [rate] = called(calls, '/rpc/consume_rate_limit');
  assert.equal((rate?.init.headers as Record<string, string>).Authorization, 'Bearer user-jwt');
  assert.deepEqual(JSON.parse(String(rate?.init.body)), { p_bucket: 'freight_invoice_upload' });

  const fields = {
    p_user_id: USER,
    p_trip_id: TRIP,
    p_direction: 'carrier_to_fulmis',
    p_cfdi_uuid: SYNTHETIC_UUID,
    p_issuer_rfc: 'FLI040404CD4',
    p_receiver_rfc: 'FUL201015AB1',
    p_total_cents: 970_000,
    p_currency: 'MXN',
  };
  const [check] = called(calls, '/rpc/check_freight_invoice_service');
  assert.deepEqual(JSON.parse(String(check?.init.body)), fields);
  assert.equal((check?.init.headers as Record<string, string>).Authorization, 'Bearer service-key');

  const uploads = calls.filter((call) => call.url.includes('/storage/v1/object/invoices/'));
  assert.deepEqual(
    uploads.map((call) => [
      call.url,
      (call.init.headers as Record<string, string>)['Content-Type'],
    ]),
    [
      [
        `http://supabase.test/storage/v1/object/invoices/${TRIP}/carrier_to_fulmis/${OBJECT}.xml`,
        'application/xml',
      ],
      [
        `http://supabase.test/storage/v1/object/invoices/${TRIP}/carrier_to_fulmis/${OBJECT}.pdf`,
        'application/pdf',
      ],
    ],
  );
  const [record] = called(calls, '/rpc/record_freight_invoice_service');
  assert.deepEqual(JSON.parse(String(record?.init.body)), {
    ...fields,
    p_issued_at: '2026-11-06T10:00:00',
    p_xml_path: `${TRIP}/carrier_to_fulmis/${OBJECT}.xml`,
    p_pdf_path: `${TRIP}/carrier_to_fulmis/${OBJECT}.pdf`,
    p_provider: 'manual',
  });
  // The check runs before anything is stored, the record after.
  const order = calls.map((call) => new URL(call.url).pathname.split('/').at(-1));
  assert.ok(order.indexOf('check_freight_invoice_service') < order.indexOf(`${OBJECT}.xml`));
  assert.ok(order.indexOf(`${OBJECT}.pdf`) < order.indexOf('record_freight_invoice_service'));
  // Nothing sensitive in the logs.
  assert.ok(!lines.join('\n').includes(TRIP));
});

Deno.test('the PDF is optional for the carrier', async () => {
  const { deps, calls } = setup();
  const response = await handleValidateCarrierCfdi(request({ pdf: null }), deps);
  assert.equal(response.status, 200);
  const [record] = called(calls, '/rpc/record_freight_invoice_service');
  assert.equal(JSON.parse(String(record?.init.body)).p_pdf_path, null);
});

Deno.test('says every failed rule of the XML and the PDF, before storing anything', async () => {
  const { deps, calls } = setup();
  const response = await handleValidateCarrierCfdi(
    request({
      xml: syntheticCfdi({ currency: 'USD', unstamped: true }),
      pdf: new TextEncoder().encode('not a pdf'),
    }),
    deps,
  );
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: 'invalid_cfdi',
    failures: ['currency', 'uuid', 'pdf_invalid'],
  });
  assert.equal(called(calls, '/rpc/check_freight_invoice_service').length, 0);
  assert.ok(!calls.some((call) => call.url.includes('/storage/')));
});

Deno.test('rejects a DTD and a missing XML', async () => {
  const xxe = setup();
  const dtd = await handleValidateCarrierCfdi(
    request({
      xml: '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>',
    }),
    xxe.deps,
  );
  assert.equal(dtd.status, 422);
  assert.deepEqual((await dtd.json()).failures, ['dtd']);

  const missing = await handleValidateCarrierCfdi(request({ xml: null }), setup().deps);
  assert.equal(missing.status, 422);
  assert.deepEqual((await missing.json()).failures, ['xml_missing']);
});

Deno.test('refuses a CFDI dated out of range before storing anything', async () => {
  // 9999-12-31 after 18:00 in Mexico City is year 10000 in UTC (unreadable by the apps).
  for (const issuedAt of ['9999-12-31T23:59:59', '0100-01-01T00:00:00']) {
    const { deps, calls } = setup();
    const response = await handleValidateCarrierCfdi(
      request({ xml: syntheticCfdi({ issuedAt }) }),
      deps,
    );
    assert.equal(response.status, 422);
    assert.deepEqual((await response.json()).failures, ['issued_at']);
    assert.equal(called(calls, '/rpc/record_freight_invoice_service').length, 0);
    assert.equal(
      calls.filter((call) => call.url.includes('/storage/')).length,
      0,
      'nothing is stored',
    );
  }
});

Deno.test('passes on the rules the database refuses (receiver, total)', async () => {
  const { deps, calls } = setup({
    check: () => ok({ failures: ['receiver_mismatch', 'total_mismatch'], validation: 'validated' }),
  });
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: 'invalid_cfdi',
    failures: ['receiver_mismatch', 'total_mismatch'],
  });
  assert.ok(!calls.some((call) => call.url.includes('/storage/')));
});

Deno.test('an unknown trip or one of another company answers 404', async () => {
  const { deps, calls } = setup({
    check: () => ok({ code: '42501', message: 'trip not available' }, 403),
  });
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
  assert.ok(!calls.some((call) => call.url.includes('/storage/')));
});

Deno.test('removes the stored files when the record is refused', async () => {
  const { deps, calls } = setup({
    record: () =>
      ok({ code: '23505', message: 'invalid invoice', details: 'uuid_taken', hint: null }, 409),
  });
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).failures, ['uuid_taken']);
  const removal = calls.find((call) => call.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(String(removal?.init.body)), {
    prefixes: [
      `${TRIP}/carrier_to_fulmis/${OBJECT}.xml`,
      `${TRIP}/carrier_to_fulmis/${OBJECT}.pdf`,
    ],
  });
});

Deno.test('a failed upload stores nothing and records nothing', async () => {
  let uploads = 0;
  const { deps, calls } = setup({
    upload: () => (++uploads === 1 ? ok({ Key: 'x' }) : ok({ error: 'boom' }, 500)),
  });
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 502);
  assert.equal(called(calls, '/rpc/record_freight_invoice_service').length, 0);
  // The failed PDF too: Storage may have kept it.
  const removal = calls.find((call) => call.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(String(removal?.init.body)).prefixes, [
    `${TRIP}/carrier_to_fulmis/${OBJECT}.xml`,
    `${TRIP}/carrier_to_fulmis/${OBJECT}.pdf`,
  ]);
});

Deno.test('a thrown upload removes what was stored and records nothing', async () => {
  let uploads = 0;
  const { deps, calls } = setup({
    upload: () => {
      if (++uploads === 1) return ok({ Key: 'x' });
      throw new Error('connection reset');
    },
  });
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 502);
  assert.equal(called(calls, '/rpc/record_freight_invoice_service').length, 0);
  const removal = calls.find((call) => call.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(String(removal?.init.body)).prefixes, [
    `${TRIP}/carrier_to_fulmis/${OBJECT}.xml`,
    `${TRIP}/carrier_to_fulmis/${OBJECT}.pdf`,
  ]);
});

Deno.test('an uncertain record keeps the files (the invoice may exist)', async () => {
  const { deps, calls } = setup({
    record: () => {
      throw new Error('connection reset');
    },
  });
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 502);
  assert.ok(!calls.some((call) => call.init.method === 'DELETE'));
});

Deno.test('needs a valid session, a trip id and a multipart body', async () => {
  const noAuth = await handleValidateCarrierCfdi(
    request({}, { authorization: null }),
    setup().deps,
  );
  assert.equal(noAuth.status, 401);

  const badUser = await handleValidateCarrierCfdi(
    request(),
    setup({ user: () => ok({ message: 'invalid JWT' }, 401) }).deps,
  );
  assert.equal(badUser.status, 401);

  const badTrip = await handleValidateCarrierCfdi(request({ tripId: 'x' }), setup().deps);
  assert.equal(badTrip.status, 400);

  const jsonBody = await handleValidateCarrierCfdi(
    new Request('http://functions.test/validate-carrier-cfdi', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: TRIP }),
    }),
    setup().deps,
  );
  assert.equal(jsonBody.status, 400);

  const get = await handleValidateCarrierCfdi(
    new Request('http://functions.test/validate-carrier-cfdi', { method: 'GET' }),
    setup().deps,
  );
  assert.equal(get.status, 405);

  const options = await handleValidateCarrierCfdi(
    new Request('http://functions.test/validate-carrier-cfdi', { method: 'OPTIONS' }),
    setup().deps,
  );
  assert.equal(options.status, 204);

  const notConfigured = await handleValidateCarrierCfdi(
    request(),
    setup({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } }).deps,
  );
  assert.equal(notConfigured.status, 500);
});

Deno.test('rate limited callers get 429 with Retry-After', async () => {
  const { deps, calls } = setup({ rateLimit: () => ok(42) });
  const response = await handleValidateCarrierCfdi(request(), deps);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '42');
  assert.equal(called(calls, '/rpc/check_freight_invoice_service').length, 0);
});

Deno.test('never reads a body over the limit', async () => {
  const { deps, calls } = setup();
  const declared = await handleValidateCarrierCfdi(
    new Request('http://functions.test/validate-carrier-cfdi', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-jwt',
        'Content-Type': 'multipart/form-data; boundary=x',
        'Content-Length': String(MAX_BODY_BYTES + 1),
      },
      body: 'x',
    }),
    deps,
  );
  assert.equal(declared.status, 413);

  // Streamed without a length: cut at the limit.
  const big = new Uint8Array(MAX_BODY_BYTES + 1);
  const streamed = await handleValidateCarrierCfdi(
    new Request('http://functions.test/validate-carrier-cfdi', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-jwt',
        'Content-Type': 'multipart/form-data; boundary=x',
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(big);
          controller.close();
        },
      }),
    }),
    deps,
  );
  assert.equal(streamed.status, 413);
  assert.deepEqual((await streamed.json()).failures, ['too_large']);
  // Only the session and the limit were asked, before reading anything.
  assert.deepEqual(
    calls.map((call) => new URL(call.url).pathname),
    [
      '/auth/v1/user',
      '/rest/v1/rpc/consume_rate_limit',
      '/auth/v1/user',
      '/rest/v1/rpc/consume_rate_limit',
    ],
  );
});

Deno.test('a malformed body still spends the caller limit', async () => {
  const { deps, calls } = setup({ rateLimit: () => ok(30) });
  const response = await handleValidateCarrierCfdi(
    new Request('http://functions.test/validate-carrier-cfdi', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-jwt',
        'Content-Type': 'multipart/form-data; boundary=x',
      },
      body: 'not multipart',
    }),
    deps,
  );
  assert.equal(response.status, 429);
  assert.equal(called(calls, '/rpc/consume_rate_limit').length, 1);
});
