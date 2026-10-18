// deno test supabase/functions — Edge Function `redeem-invitation` (G2) with
// a simulated Supabase (PostgREST and the GoTrue admin API): no network.
import assert from 'node:assert/strict';
import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import { handleRedeem, type Dependencies } from './handler.ts';

const TOKEN = 'a'.repeat(43);
const USER_ID = 'a2000000-0000-4000-8000-000000000001';
const PROFILE_ID = 'a2000000-0000-4000-8000-000000000002';
const PHONE = '81 1000 0013';
const PASSWORD = 'camion2026';

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

type Answer = Response | (() => Response);

function postgrestError(code: string, message: string, status = 400): Response {
  return Response.json({ code, message, details: null, hint: null }, { status });
}

function setup(
  options: {
    env?: Record<string, string | undefined>;
    kind?: 'operator' | 'operator_access_reset' | 'coordinator';
    preview?: Answer;
    rateLimit?: (bucket: string) => Response;
    createUser?: Answer;
    ticket?: Answer;
    redeem?: Answer;
    updatePassword?: Answer;
    deleteUser?: Answer;
    linked?: Answer;
    revokeSessions?: Answer;
  } = {},
) {
  const calls: Call[] = [];
  const lines: string[] = [];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...options.env,
  };
  const answer = (value: Answer | undefined, fallback: Response) =>
    value === undefined ? fallback : typeof value === 'function' ? value() : value;
  const deps: Dependencies = {
    env: (name) => env[name],
    log: createLogger({ service: 'test', sink: (_level, line) => lines.push(line) }),
    fetch: (url, init) => {
      const method = init.method ?? 'GET';
      const body =
        typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ url, method, body });
      if (url.endsWith('/rpc/consume_service_rate_limit')) {
        return Promise.resolve(options.rateLimit?.(String(body?.p_bucket)) ?? Response.json(0));
      }
      if (url.endsWith('/rpc/issue_operator_provisioning_ticket_service')) {
        return Promise.resolve(answer(options.ticket, new Response(null, { status: 204 })));
      }
      if (url.endsWith('/rpc/invitation_preview')) {
        return Promise.resolve(
          answer(options.preview, Response.json([{ kind: options.kind ?? 'operator' }])),
        );
      }
      if (url.endsWith('/auth/v1/admin/users') && method === 'POST') {
        return Promise.resolve(answer(options.createUser, Response.json({ id: USER_ID })));
      }
      if (url.endsWith('/rpc/redeem_operator_invitation_service')) {
        return Promise.resolve(
          answer(
            options.redeem,
            Response.json([{ operator_id: 'op', profile_id: PROFILE_ID, kind: options.kind }]),
          ),
        );
      }
      if (url.endsWith(`/auth/v1/admin/users/${USER_ID}`) && method === 'DELETE') {
        return Promise.resolve(answer(options.deleteUser, Response.json({})));
      }
      if (url.endsWith(`/auth/v1/admin/users/${PROFILE_ID}`) && method === 'PUT') {
        return Promise.resolve(answer(options.updatePassword, Response.json({ id: PROFILE_ID })));
      }
      if (url.includes('/rest/v1/operators?') && method === 'GET') {
        return Promise.resolve(answer(options.linked, Response.json([])));
      }
      if (url.endsWith('/rpc/revoke_user_sessions_service')) {
        return Promise.resolve(answer(options.revokeSessions, Response.json(2)));
      }
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    },
  };
  const of = (fragment: string) => calls.filter((c) => c.url.includes(fragment));
  return { deps, calls, lines, of };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://functions.test/redeem-invitation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const operatorBody = { token: TOKEN, fullName: 'Iván Garza', phone: PHONE, password: PASSWORD };

Deno.test('issues the provisioning ticket and sends its nonce with the new account', async () => {
  const { deps, of } = setup();
  const response = await handleRedeem(post(operatorBody), deps);
  assert.equal(response.status, 200);
  const ticket = of('/rpc/issue_operator_provisioning_ticket_service')[0]?.body;
  const user = of('/auth/v1/admin/users')[0]?.body as {
    email?: string;
    user_metadata?: { provisioning_nonce?: string };
  };
  assert.equal(ticket?.p_email, '528110000013@tel.transport.invalid');
  assert.match(String(ticket?.p_nonce), /^[0-9a-f]{64}$/u);
  assert.equal(user.email, ticket?.p_email);
  assert.equal(user.user_metadata?.provisioning_nonce, ticket?.p_nonce);
});

Deno.test('creates no account when the ticket cannot be issued', async () => {
  const { deps, of } = setup({ ticket: postgrestError('XX000', 'boom', 500) });
  const response = await handleRedeem(post(operatorBody), deps);
  assert.equal(response.status, 502);
  assert.equal(of('/auth/v1/admin/users').length, 0);
});

Deno.test('a lost answer of a committed redemption keeps the account', async () => {
  const { deps, of } = setup({
    redeem: () => {
      throw new TypeError('connection reset');
    },
    linked: Response.json([{ id: 'op' }]),
  });
  const response = await handleRedeem(post(operatorBody), deps);
  assert.equal(response.status, 200);
  assert.equal(of('/auth/v1/admin/users/').filter((c) => c.method === 'DELETE').length, 0);
});

Deno.test('the account is kept when the compensation check fails', async () => {
  const { deps, of } = setup({
    redeem: postgrestError('XX000', 'boom', 500),
    linked: postgrestError('XX000', 'down', 503),
  });
  const response = await handleRedeem(post(operatorBody), deps);
  assert.equal(response.status, 502);
  assert.equal(of('/auth/v1/admin/users/').filter((c) => c.method === 'DELETE').length, 0);
});

Deno.test('answers CORS preflight and rejects other methods', async () => {
  const { deps } = setup();
  const preflight = await handleRedeem(new Request('http://x', { method: 'OPTIONS' }), deps);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /x-request-id/u);
  assert.equal((await handleRedeem(new Request('http://x'), deps)).status, 405);
});

Deno.test('fails closed without the service role', async () => {
  const { deps, calls } = setup({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
  const response = await handleRedeem(post(operatorBody), deps);
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

Deno.test('refuses a body without a well-formed token before touching the database', async () => {
  const { deps, calls } = setup();
  for (const body of ['not json', [], {}, { token: 'short' }, { token: `${'a'.repeat(42)}+` }]) {
    const response = await handleRedeem(post(body), deps);
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { error: string }).error, 'invalid_body');
  }
  assert.equal(calls.length, 0);
});

Deno.test('the address bucket ignores what the client puts first in X-Forwarded-For', async () => {
  const subjects: unknown[] = [];
  for (const forwarded of ['198.51.100.1, 203.0.113.9', '198.51.100.2, 203.0.113.9']) {
    const { deps, calls } = setup();
    await handleRedeem(post(operatorBody, { 'x-forwarded-for': forwarded }), deps);
    subjects.push(calls.find((c) => c.body?.p_bucket === 'redeem-invitation-ip')?.body?.p_subject);
  }
  assert.equal(subjects[0], subjects[1]);
});

Deno.test('rate limits by hashed address and by hashed token', async () => {
  const { deps, calls } = setup();
  await handleRedeem(post(operatorBody, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), deps);
  const limits = calls.filter((c) => c.url.endsWith('/rpc/consume_service_rate_limit'));
  assert.deepEqual(
    limits.map((c) => c.body?.p_bucket),
    ['redeem-invitation-ip', 'redeem-invitation-token'],
  );
  for (const call of limits) {
    const subject = String(call.body?.p_subject);
    assert.match(subject, /^[0-9a-f]{64}$/u);
    assert.notEqual(subject, TOKEN);
    assert.ok(!subject.includes('203.0.113.9'));
  }
  // The same address hashes the same; the token hash differs from it.
  assert.notEqual(limits[0]?.body?.p_subject, limits[1]?.body?.p_subject);

  const limited = setup({
    rateLimit: (bucket) => Response.json(bucket === 'redeem-invitation-token' ? 90 : 0),
  });
  const response = await handleRedeem(post(operatorBody), limited.deps);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'rate_limited', retryAfter: 90 });
  assert.equal(limited.of('/auth/').length, 0);

  const broken = setup({ rateLimit: () => postgrestError('42501', 'service role required', 403) });
  assert.equal((await handleRedeem(post(operatorBody), broken.deps)).status, 502);
});

Deno.test('an unknown, used or expired token answers 404 without creating anything', async () => {
  const { deps, of } = setup({ preview: postgrestError('22023', 'invalid or expired invitation') });
  const response = await handleRedeem(post(operatorBody), deps);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'invalid_invitation' });
  assert.equal(of('/auth/').length, 0);

  const coordinator = setup({ kind: 'coordinator' });
  assert.equal((await handleRedeem(post(operatorBody), coordinator.deps)).status, 404);
  assert.equal(coordinator.of('/auth/').length, 0);
});

Deno.test(
  'operator: creates the phone account, links it and answers the synthetic email',
  async () => {
    const { deps, of, lines } = setup();
    const response = await handleRedeem(
      post({ ...operatorBody, email: 'Ivan@Example.MX', fullName: ' Iván Garza ' }),
      deps,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      kind: 'operator',
      email: '528110000013@tel.transport.invalid',
    });

    const created = of('/auth/v1/admin/users')[0];
    assert.equal(created?.method, 'POST');
    assert.deepEqual(created?.body, {
      email: '528110000013@tel.transport.invalid',
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: 'operator',
        full_name: 'Iván Garza',
        phone: '+528110000013',
        provisioning_nonce: of('/rpc/issue_operator_provisioning_ticket_service')[0]?.body?.p_nonce,
        contact_email: 'ivan@example.mx',
      },
      app_metadata: { provisioned_by: 'redeem-invitation' },
    });
    const redeemed = of('/rpc/redeem_operator_invitation_service')[0];
    assert.deepEqual(redeemed?.body, {
      p_token: TOKEN,
      p_user_id: USER_ID,
      p_full_name: 'Iván Garza',
      p_phone: '+528110000013',
      p_email: 'ivan@example.mx',
    });
    assert.equal(of('DELETE').length, 0);

    // No PII in the logs: not the phone, the password, the email nor the token.
    const text = lines.join('\n');
    for (const secret of ['0000013', PASSWORD, 'ivan@example', 'Garza', TOKEN]) {
      assert.ok(!text.includes(secret), `log leaks ${secret}`);
    }
  },
);

Deno.test('operator: validates the account fields with the shared schema', async () => {
  const { deps, of } = setup();
  const response = await handleRedeem(post({ token: TOKEN, phone: '12', password: 'corta' }), deps);
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string; fields: Record<string, string> };
  assert.equal(body.error, 'invalid_body');
  assert.deepEqual(Object.keys(body.fields).sort(), ['fullName', 'password', 'phone']);
  assert.equal(of('/auth/').length, 0);
});

Deno.test('operator: a phone that already has an account answers 409', async () => {
  const { deps, of } = setup({
    createUser: Response.json(
      {
        code: 422,
        error_code: 'email_exists',
        msg: 'A user with this email address has already been registered',
      },
      { status: 422 },
    ),
  });
  const response = await handleRedeem(post(operatorBody), deps);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'phone_taken' });
  assert.equal(of('/rpc/redeem_operator_invitation_service').length, 0);
});

Deno.test(
  'operator: deletes the account again when the link cannot be redeemed (compensation)',
  async () => {
    const { deps, of, lines } = setup({
      redeem: postgrestError('22023', 'invalid or expired invitation'),
    });
    const response = await handleRedeem(post(operatorBody), deps);
    assert.equal(response.status, 404);
    const deleted = of(`/auth/v1/admin/users/${USER_ID}`).find((c) => c.method === 'DELETE');
    assert.ok(deleted, 'the created user is deleted');
    assert.ok(!lines.join('\n').includes(PASSWORD));

    const broken = setup({
      redeem: postgrestError('42501', 'user already belongs to a company', 403),
      deleteUser: Response.json({ msg: 'boom' }, { status: 500 }),
    });
    const failed = await handleRedeem(post(operatorBody), broken.deps);
    assert.equal(failed.status, 502);
    assert.ok(
      broken.lines.some(
        (line) => line.includes('orphan operator account') && line.includes(USER_ID),
      ),
      'a failed compensation is logged with the user id',
    );
  },
);

Deno.test(
  'access reset: redeems the link, replaces the password of that profile and ends its sessions',
  async () => {
    const { deps, of, calls, lines } = setup({ kind: 'operator_access_reset' });
    const response = await handleRedeem(post({ token: TOKEN, password: 'nueva2026' }), deps);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      kind: 'operator_access_reset',
      sessionsRevoked: true,
    });

    const redeemed = of('/rpc/redeem_operator_invitation_service')[0];
    assert.deepEqual(redeemed?.body, { p_token: TOKEN, p_user_id: null });
    const updated = of(`/auth/v1/admin/users/${PROFILE_ID}`)[0];
    assert.equal(updated?.method, 'PUT');
    assert.deepEqual(updated?.body, { password: 'nueva2026' });
    assert.deepEqual(of('/rpc/revoke_user_sessions_service')[0]?.body, { p_user_id: PROFILE_ID });
    // The link is redeemed before the password changes.
    assert.ok(
      calls.findIndex((c) => c.url.includes('redeem_operator_invitation_service')) <
        calls.findIndex((c) => c.url.includes(`/auth/v1/admin/users/${PROFILE_ID}`)),
    );
    assert.equal(of('/auth/v1/admin/users').filter((c) => c.method === 'POST').length, 0);
    assert.ok(!lines.join('\n').includes('nueva2026'));
  },
);

Deno.test(
  'access reset: a second redemption of the same link is rejected without touching the password',
  async () => {
    const { deps, of } = setup({
      kind: 'operator_access_reset',
      redeem: postgrestError('22023', 'invalid or expired invitation'),
    });
    const response = await handleRedeem(post({ token: TOKEN, password: 'nueva2026' }), deps);
    assert.equal(response.status, 404);
    assert.equal(of('/auth/').length, 0);
    assert.equal(of('/rpc/revoke_user_sessions_service').length, 0);
  },
);

Deno.test(
  'access reset: when the password cannot be saved the answer asks for a new link',
  async () => {
    const { deps, of } = setup({
      kind: 'operator_access_reset',
      updatePassword: Response.json({ msg: 'boom' }, { status: 500 }),
    });
    const response = await handleRedeem(post({ token: TOKEN, password: 'nueva2026' }), deps);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'password_not_saved' });
    assert.equal(of('/rpc/revoke_user_sessions_service').length, 0);

    const weak = setup({ kind: 'operator_access_reset' });
    assert.equal(
      (await handleRedeem(post({ token: TOKEN, password: 'corta' }), weak.deps)).status,
      400,
    );
    assert.equal(weak.of('/rpc/redeem_operator_invitation_service').length, 0);
  },
);
