// deno test supabase/functions — Edge Function `dispatch-notifications` (B09)
// with simulated Supabase, Expo Push and Resend (no network, no keys).
import assert from 'node:assert/strict';
import {
  EXPO_PUSH_URL,
  RESEND_URL,
  handleDispatch,
  pushData,
  type ClaimedNotification,
  type Dependencies,
  type DispatchResult,
} from './handler.ts';

const SECRET = 'test-dispatch-secret';
const LOAD = '0b6a8f0e-7f43-4f6e-9d2a-3f1e2d4c5b6a';
const ROUTE = { loadId: LOAD, originCity: 'Monterrey', destinationCity: 'Guadalajara' };
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbb]';
const TOKEN_C = 'ExponentPushToken[cccccccccccc]';

const row = (id: string, overrides: Partial<ClaimedNotification> = {}): ClaimedNotification => ({
  id,
  user_id: `user-${id}`,
  type: 'offer_received',
  data: { ...ROUTE, amountCents: 3_450_000 },
  created_at: '2026-10-20T12:00:00Z',
  attempt: 1,
  push_pending: true,
  email_pending: true,
  email: null,
  role: 'carrier',
  push_tokens: [],
  ...overrides,
});

interface Call {
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

function setup(options: {
  batches: ClaimedNotification[][];
  env?: Record<string, string | undefined>;
  expo?: (messages: { to: string }[]) => Response;
  resend?: () => Response;
  claimFails?: boolean;
}) {
  const calls: Call[] = [];
  const batches = [...options.batches];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    NOTIFICATIONS_DISPATCH_SECRET: SECRET,
    EMAIL_PROVIDER_API_KEY: 'resend-key',
    EMAIL_FROM: 'Avisos <avisos@transport.test>',
    SITE_URL: 'https://transport.test',
    ...options.env,
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    fetch: (url, init) => {
      const body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body, headers: init.headers as Record<string, string> });
      if (url.endsWith('/rpc/claim_notifications')) {
        if (options.claimFails) return Promise.resolve(new Response('{}', { status: 500 }));
        return Promise.resolve(Response.json(batches.shift() ?? []));
      }
      if (url.endsWith('/rpc/record_notification_dispatch'))
        return Promise.resolve(Response.json((body as { p_results: unknown[] }).p_results.length));
      if (url.endsWith('/rpc/delete_push_tokens')) return Promise.resolve(Response.json(1));
      if (url === EXPO_PUSH_URL) {
        const messages = body as { to: string }[];
        return Promise.resolve(
          options.expo?.(messages) ??
            Response.json({
              data: messages.map(() => ({ status: 'ok', id: crypto.randomUUID() })),
            }),
        );
      }
      if (url === RESEND_URL)
        return Promise.resolve(options.resend?.() ?? Response.json({ id: 'email-1' }));
      return Promise.reject(new Error(`unexpected ${url}`));
    },
  };
  const of = (suffix: string) => calls.filter((c) => c.url.endsWith(suffix));
  const recorded = () =>
    of('/rpc/record_notification_dispatch').flatMap(
      (c) => (c.body as { p_results: DispatchResult[] }).p_results,
    );
  return { calls, deps, of, recorded };
}

const post = (secret: string | null = SECRET) =>
  new Request('http://functions.test/dispatch-notifications', {
    method: 'POST',
    headers: secret === null ? {} : { 'x-dispatch-secret': secret },
  });

Deno.test('only POST with the dispatch secret is accepted', async () => {
  const { deps, calls } = setup({ batches: [] });
  assert.equal(
    (await handleDispatch(new Request('http://functions.test/', { method: 'GET' }), deps)).status,
    405,
  );
  assert.equal((await handleDispatch(post(null), deps)).status, 401);
  assert.equal((await handleDispatch(post('wrong'), deps)).status, 401);
  assert.equal(calls.length, 0);

  const unconfigured = setup({ batches: [], env: { NOTIFICATIONS_DISPATCH_SECRET: undefined } });
  const response = await handleDispatch(post(''), unconfigured.deps);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'not_configured' });
});

Deno.test(
  'sends push to every device and email to web users, then records each result',
  async () => {
    const shipper = row('n1', { role: 'shipper', email: 'sara@s.test' });
    const carrier = row('n2', { type: 'load_match', push_tokens: [TOKEN_A, TOKEN_B] });
    const operator = row('n3', {
      type: 'trip_assigned',
      role: 'operator',
      email: 'oscar@a.test',
      push_tokens: [TOKEN_C],
    });
    const { deps, of, recorded } = setup({
      batches: [[shipper, carrier, operator]],
      expo: (messages) =>
        Response.json({
          data: messages.map((m) =>
            m.to === TOKEN_B
              ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
              : m.to === TOKEN_C
                ? {
                    status: 'error',
                    message: 'slow down',
                    details: { error: 'MessageRateExceeded' },
                  }
                : { status: 'ok', id: 't' },
          ),
        }),
    });

    const response = await handleDispatch(post(), deps);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      claimed: 3,
      pushed: 1,
      emailed: 1,
      simulatedEmails: 0,
      retried: 1,
      invalidTokens: 1,
    });

    // One Expo request with the three devices, rendered with the shared copy.
    const [expo] = of(EXPO_PUSH_URL);
    const messages = expo!.body as { to: string; title: string; body: string; data: unknown }[];
    assert.deepEqual(
      messages.map((m) => m.to),
      [TOKEN_A, TOKEN_B, TOKEN_C],
    );
    assert.equal(messages[0]!.title, 'Carga compatible');
    assert.equal(
      messages[0]!.body,
      'Hay una carga nueva Monterrey → Guadalajara compatible con tu unidad.',
    );
    assert.deepEqual(messages[0]!.data, { loadId: LOAD, notificationId: 'n2', type: 'load_match' });

    // Email only for the shipper (the operator uses the app), with an idempotency key.
    const emails = of(RESEND_URL);
    assert.equal(emails.length, 1);
    const email = emails[0]!.body as Record<string, unknown>;
    assert.deepEqual(email.to, ['sara@s.test']);
    assert.equal(email.subject, 'Nueva oferta · Transporte de carga');
    assert.match(String(email.html), /https:\/\/transport\.test\/cliente\/cargas\//u);
    assert.equal(emails[0]!.headers['Idempotency-Key'], 'notification-n1');
    assert.equal(emails[0]!.headers.Authorization, 'Bearer resend-key');

    assert.deepEqual(of('/rpc/delete_push_tokens')[0]!.body, { p_tokens: [TOKEN_B] });
    assert.deepEqual(recorded(), [
      { id: 'n1', attempt: 1, pushSent: false, emailSent: true, done: true },
      {
        id: 'n2',
        attempt: 1,
        pushSent: true,
        emailSent: false,
        done: true,
        error: 'push: DeviceNotRegistered',
      },
      {
        id: 'n3',
        attempt: 1,
        pushSent: false,
        emailSent: false,
        done: false,
        error: 'push: MessageRateExceeded',
      },
    ]);
    assert.equal(of('/rpc/claim_notifications').length, 1, 'a short batch ends the run');
    const claim = of('/rpc/claim_notifications')[0]!;
    assert.equal(claim.headers.Authorization, 'Bearer service-key');
  },
);

Deno.test('a retry only sends the channels that are still pending', async () => {
  const pushDone = row('n1', {
    role: 'shipper',
    email: 'sara@s.test',
    push_tokens: [TOKEN_A],
    push_pending: false,
    attempt: 2,
  });
  const emailDone = row('n2', {
    role: 'shipper',
    email: 'sara@s.test',
    push_tokens: [TOKEN_B],
    email_pending: false,
    attempt: 3,
  });
  const { deps, of, recorded } = setup({ batches: [[pushDone, emailDone]] });
  await handleDispatch(post(), deps);

  assert.deepEqual(
    (of(EXPO_PUSH_URL)[0]!.body as { to: string }[]).map((m) => m.to),
    [TOKEN_B],
  );
  assert.equal(of(RESEND_URL).length, 1);
  assert.equal(of(RESEND_URL)[0]!.headers['Idempotency-Key'], 'notification-n1');
  assert.deepEqual(recorded(), [
    { id: 'n1', attempt: 2, pushSent: false, emailSent: true, done: true },
    { id: 'n2', attempt: 3, pushSent: true, emailSent: false, done: true },
  ]);
});

Deno.test('without an email provider the email is simulated, not sent', async () => {
  const { deps, of, recorded } = setup({
    batches: [[row('n1', { role: 'admin', email: 'admin@x.test' })]],
    env: { EMAIL_PROVIDER_API_KEY: undefined },
  });
  const response = await handleDispatch(post(), deps);
  assert.equal((await response.json()).simulatedEmails, 1);
  assert.equal(of(RESEND_URL).length, 0);
  assert.equal(of(EXPO_PUSH_URL).length, 0, 'no devices, no push request');
  assert.deepEqual(recorded(), [
    { id: 'n1', attempt: 1, pushSent: false, emailSent: false, done: true },
  ]);
});

Deno.test('email failures: temporary ones are retried, permanent ones are not', async () => {
  for (const [status, done] of [
    [429, false],
    [500, false],
    [409, false],
    [422, true],
  ] as const) {
    const { deps, recorded } = setup({
      batches: [[row('n1', { role: 'shipper', email: 'sara@s.test' })]],
      resend: () => new Response('{}', { status }),
    });
    await handleDispatch(post(), deps);
    assert.deepEqual(recorded(), [
      {
        id: 'n1',
        attempt: 1,
        pushSent: false,
        emailSent: false,
        done,
        error: `email: HTTP ${status}`,
      },
    ]);
  }
});

Deno.test('a failed Expo request is retried for every notification in it', async () => {
  const { deps, recorded } = setup({
    batches: [[row('n1', { push_tokens: [TOKEN_A] }), row('n2', { push_tokens: [TOKEN_B] })]],
    expo: () => new Response('{}', { status: 503 }),
  });
  await handleDispatch(post(), deps);
  assert.deepEqual(
    recorded().map((r) => [r.id, r.done, r.error]),
    [
      ['n1', false, 'push: RequestFailed'],
      ['n2', false, 'push: RequestFailed'],
    ],
  );
});

Deno.test('claims batches until the queue is empty', async () => {
  const full = Array.from({ length: 50 }, (_, i) => row(`n${i}`));
  const { deps, of } = setup({ batches: [full, [row('last')]] });
  const response = await handleDispatch(post(), deps);
  assert.equal((await response.json()).claimed, 51);
  assert.equal(of('/rpc/claim_notifications').length, 2);
  assert.equal(of('/rpc/record_notification_dispatch').length, 2);
});

Deno.test('a failing claim answers 502 and records nothing', async () => {
  const { deps, of } = setup({ batches: [], claimFails: true });
  const response = await handleDispatch(post(), deps);
  assert.equal(response.status, 502);
  assert.equal(of('/rpc/record_notification_dispatch').length, 0);
});

Deno.test('push data carries ids only, never free text', () => {
  assert.deepEqual(
    pushData(
      row('n1', {
        type: 'document_rejected',
        data: { documentId: 'd1', reviewNotes: 'Es ilegible', ownerId: 'o1', amountCents: 5 },
      }),
    ),
    { documentId: 'd1', ownerId: 'o1', notificationId: 'n1', type: 'document_rejected' },
  );
});
