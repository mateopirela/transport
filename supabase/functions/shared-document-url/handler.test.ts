// deno test supabase/functions/shared-document-url — Edge Function
// `shared-document-url` (G6) with simulated Auth, PostgREST and Storage (no
// network, no keys).
import assert from 'node:assert/strict';

import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import { handleSharedDocumentUrl, SIGNED_URL_SECONDS, type Dependencies } from './handler.ts';

const USER = 'a3400000-0000-4000-8000-000000000001';
const SHARE = 'b3400000-0000-4000-8000-000000000001';
const PATH =
  'c3400000-0000-4000-8000-000000000002/company/c3400000-0000-4000-8000-000000000002/f3400000-0000-4000-8000-000000000001.pdf';

interface Call {
  url: string;
  init: RequestInit;
}

type Answer = () => Response | Promise<Response>;

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(options: {
  env?: Record<string, string | undefined>;
  user?: Answer;
  rateLimit?: Answer;
  authorize?: Answer;
  sign?: Answer;
}) {
  const calls: Call[] = [];
  const lines: string[] = [];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...options.env,
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    log: createLogger({ service: 'test', sink: (_level, line) => lines.push(line) }),
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/v1/user')) return (options.user ?? (() => ok({ id: USER })))();
      if (url.endsWith('/rpc/consume_rate_limit')) return (options.rateLimit ?? (() => ok(0)))();
      if (url.endsWith('/rpc/authorize_shared_document_view_service')) {
        return (options.authorize ?? (() => ok(PATH)))();
      }
      if (url.includes('/storage/v1/object/sign/documents/')) {
        return (
          options.sign ??
          (() => ok({ signedURL: `/object/sign/documents/${PATH}?token=signed-token` }))
        )();
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  return { deps, calls, lines };
}

function request(body: unknown = { shareId: SHARE }, init: RequestInit = {}): Request {
  return new Request('http://functions.test/shared-document-url', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

Deno.test('signs the shared document for 60 seconds for the JWT user', async () => {
  const { deps, calls } = setup({});
  const response = await handleSharedDocumentUrl(request(), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    signedPath: `/storage/v1/object/sign/documents/${PATH}?token=signed-token`,
    expiresIn: SIGNED_URL_SECONDS,
  });

  // The user comes from the JWT, never from the body; the rate limit and the
  // user lookup use the caller's token, the RPC and the signature the service key.
  const [user, limit, authorize, sign] = calls;
  assert.equal(new Headers(user?.init.headers).get('Authorization'), 'Bearer user-jwt');
  assert.equal(new Headers(limit?.init.headers).get('Authorization'), 'Bearer user-jwt');
  assert.deepEqual(JSON.parse(String(limit?.init.body)), { p_bucket: 'shared_document_url' });
  assert.equal(new Headers(authorize?.init.headers).get('Authorization'), 'Bearer service-key');
  assert.deepEqual(JSON.parse(String(authorize?.init.body)), {
    p_share_id: SHARE,
    p_user_id: USER,
  });
  assert.equal(sign?.url, `http://supabase.test/storage/v1/object/sign/documents/${PATH}`);
  assert.deepEqual(JSON.parse(String(sign?.init.body)), { expiresIn: 60 });
});

Deno.test('ignores a user id in the body', async () => {
  const { deps, calls } = setup({});
  await handleSharedDocumentUrl(request({ shareId: SHARE, userId: 'someone-else' }), deps);
  const authorize = calls.find((c) => c.url.endsWith('authorize_shared_document_view_service'));
  assert.equal(JSON.parse(String(authorize?.init.body)).p_user_id, USER);
});

Deno.test('a new secret key goes only in the apikey header', async () => {
  const { deps, calls } = setup({ env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' } });
  await handleSharedDocumentUrl(request(), deps);
  const authorize = calls.find((c) => c.url.endsWith('authorize_shared_document_view_service'));
  const headers = new Headers(authorize?.init.headers);
  assert.equal(headers.get('apikey'), 'sb_secret_x');
  assert.equal(headers.get('Authorization'), null);
});

Deno.test('refuses without a bearer token, a valid user or a well-formed share id', async () => {
  const { deps, calls } = setup({});
  const noToken = await handleSharedDocumentUrl(
    request({ shareId: SHARE }, { headers: { 'Content-Type': 'application/json' } }),
    deps,
  );
  assert.equal(noToken.status, 401);
  assert.equal((await handleSharedDocumentUrl(request({ shareId: 'x' }), deps)).status, 400);
  assert.equal((await handleSharedDocumentUrl(request('not json'), deps)).status, 400);
  assert.equal((await handleSharedDocumentUrl(request([SHARE]), deps)).status, 400);
  assert.equal(calls.length, 0, 'nothing is called for a malformed request');

  const anonymous = setup({ user: () => ok({ message: 'invalid JWT' }, 401) });
  const response = await handleSharedDocumentUrl(request(), anonymous.deps);
  assert.equal(response.status, 401);
  assert.equal(anonymous.calls.length, 1, 'an invalid JWT stops before any RPC');
});

Deno.test('a share that is unknown, revoked or of another shipper is a 404, unsigned', async () => {
  const { deps, calls } = setup({
    authorize: () => ok({ code: '42501', message: 'shared document not available' }, 403),
  });
  const response = await handleSharedDocumentUrl(request(), deps);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
  assert.equal(
    calls.some((c) => c.url.includes('/storage/')),
    false,
  );
});

Deno.test('the rate limit refuses with Retry-After', async () => {
  const { deps, calls } = setup({ rateLimit: () => ok(42) });
  const response = await handleSharedDocumentUrl(request(), deps);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '42');
  assert.equal(
    calls.some((c) => c.url.endsWith('authorize_shared_document_view_service')),
    false,
  );
});

Deno.test('never signs a path outside the documents layout', async () => {
  const { deps, calls } = setup({ authorize: () => ok('../evidence/secret.jpg') });
  const response = await handleSharedDocumentUrl(request(), deps);
  assert.equal(response.status, 502);
  assert.equal(
    calls.some((c) => c.url.includes('/storage/')),
    false,
  );
});

Deno.test('a missing file is a 404 and an unexpected signature a 502', async () => {
  const missing = setup({ sign: () => ok({ statusCode: '404', error: 'not_found' }, 400) });
  assert.equal((await handleSharedDocumentUrl(request(), missing.deps)).status, 404);
  const odd = setup({ sign: () => ok({ signedURL: 'https://elsewhere.test/x' }) });
  assert.equal((await handleSharedDocumentUrl(request(), odd.deps)).status, 502);
});

Deno.test('upstream failures answer 502 and never log the path or the token', async () => {
  const { deps, lines } = setup({
    authorize: () => ok({ code: 'XX000', message: `boom ${PATH}` }, 500),
  });
  const response = await handleSharedDocumentUrl(request(), deps);
  assert.equal(response.status, 502);
  const failing = setup({
    sign: () => {
      throw new Error('network down');
    },
  });
  assert.equal((await handleSharedDocumentUrl(request(), failing.deps)).status, 502);
  const logged = [...lines, ...failing.lines].join('\n');
  assert.ok(lines.length > 0 && failing.lines.length > 0, 'the failures are logged');
  assert.equal(logged.includes(PATH), false);
  assert.equal(logged.includes('user-jwt'), false);
  assert.equal(logged.includes(USER), false);
});

Deno.test('answers CORS preflight, refuses other methods and needs its keys', async () => {
  const { deps } = setup({});
  const preflight = await handleSharedDocumentUrl(
    new Request('http://functions.test/x', { method: 'OPTIONS' }),
    deps,
  );
  assert.equal(preflight.status, 204);
  assert.ok(preflight.headers.get('Access-Control-Allow-Origin'));
  const get = await handleSharedDocumentUrl(
    new Request('http://functions.test/x', {
      method: 'GET',
      headers: { Authorization: 'Bearer x' },
    }),
    deps,
  );
  assert.equal(get.status, 405);
  const unconfigured = setup({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
  assert.equal((await handleSharedDocumentUrl(request(), unconfigured.deps)).status, 500);
});
