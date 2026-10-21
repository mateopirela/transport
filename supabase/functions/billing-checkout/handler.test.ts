// deno test supabase/functions/billing-checkout — Edge Function
// `billing-checkout` (H3) with simulated Auth, PostgREST and Stripe (no
// network, no keys).
import assert from 'node:assert/strict';

import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import type { BillingStripe } from '../_shared/billing.ts';
import { type Dependencies, handleCheckout } from './handler.ts';

const USER = 'a4400000-0000-4000-8000-000000000002';
const COMPANY = 'c4400000-0000-4000-8000-000000000002';

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeStripe(
  log: string[],
  stripe: { live?: boolean; open?: boolean; paid?: boolean } = {},
): BillingStripe {
  return {
    createCustomer: async (companyId, key) => {
      log.push(`customer ${companyId} ${key}`);
      return 'cus_new';
    },
    createCheckoutSession: async (params, key) => {
      log.push(`checkout ${JSON.stringify(params)} ${key}`);
      return { id: 'cs_test_1', url: 'https://checkout.stripe.test/s/1' };
    },
    expireCheckout: async (sessionId) => {
      log.push(`expire ${sessionId}`);
      return stripe.paid ? 'complete' : 'expired';
    },
    isCheckoutOpen: async (sessionId) => {
      log.push(`open? ${sessionId}`);
      return stripe.open ?? true;
    },
    createPortalSession: () => Promise.reject(new Error('not expected')),
    hasLiveSubscription: async (customer) => {
      log.push(`live? ${customer}`);
      return stripe.live ?? false;
    },
    currentSubscription: () => Promise.reject(new Error('not expected')),
    verifyEvent: () => Promise.reject(new Error('not expected')),
  };
}

function setup(
  options: {
    env?: Record<string, string | undefined>;
    user?: () => Response;
    context?: () => Response;
    link?: () => Response;
    stripe?: { live?: boolean; open?: boolean; paid?: boolean };
    begin?: () => Response;
    beginAgain?: () => Response;
    save?: () => Response;
  } = {},
) {
  const calls: { url: string; body: unknown }[] = [];
  const stripeLog: string[] = [];
  const env: Record<string, string | undefined> = {
    STRIPE_SECRET_KEY: 'sk_test_x',
    SITE_URL: 'https://transport.test',
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...options.env,
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    log: createLogger({ service: 'test', sink: () => {} }),
    now: () => 1_800_000_000_000,
    stripe: async () => fakeStripe(stripeLog, options.stripe),
    fetch: async (url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith('/auth/v1/user')) return (options.user ?? (() => ok({ id: USER })))();
      if (url.endsWith('/rpc/billing_session_context_service')) {
        return (
          options.context ??
          (() =>
            ok([{ company_id: COMPANY, stripe_customer_id: null, stripe_price_id: 'price_fleet' }]))
        )();
      }
      if (url.endsWith('/rpc/billing_begin_checkout_service')) {
        if (options.beginAgain && JSON.parse(String(init.body)).p_discard_session_id) {
          return options.beginAgain();
        }
        return (
          options.begin ??
          (() =>
            ok([
              {
                action: 'create',
                session_id: null,
                url: null,
                lease_id: 'b4400000-0000-4000-8000-00000000000e',
              },
            ]))
        )();
      }
      if (url.endsWith('/rpc/billing_save_checkout_service')) {
        return (options.save ?? (() => ok(true)))();
      }
      if (url.endsWith('/rpc/billing_link_customer_service')) {
        return (options.link ?? (() => ok('cus_new')))();
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  return { deps, calls, stripeLog };
}

const post = (body: unknown, token: string | null = 'user-jwt') =>
  new Request('http://functions.test/billing-checkout', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });

Deno.test(
  'without STRIPE_SECRET_KEY it answers 503 billing_disabled and calls nothing',
  async () => {
    const { deps, calls } = setup({ env: { STRIPE_SECRET_KEY: undefined } });
    const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: 'billing_disabled' });
    assert.equal(calls.length, 0);
  },
);

Deno.test('during the pilot it answers 409 pilot_active', async () => {
  const { deps, stripeLog } = setup({
    context: () => ok({ code: '55000', message: 'pilot active' }, 400),
  });
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: 'pilot_active' });
  assert.equal(stripeLog.length, 0);
});

Deno.test('only the Gerente of the company opens Checkout', async () => {
  const { deps, stripeLog, calls } = setup({
    context: () =>
      ok({ code: '42501', message: 'only the manager can manage the subscription' }, 403),
  });
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: 'forbidden' });
  assert.equal(stripeLog.length, 0);
  // The user is the JWT's, never something from the body.
  const context = calls.find((c) => c.url.endsWith('/rpc/billing_session_context_service'));
  assert.deepEqual(context?.body, { p_user_id: USER, p_plan_code: 'fleet_monthly' });
});

Deno.test('a plan not offered or a subscription in force answer 409', async () => {
  const unavailable = setup({
    context: () => ok({ code: '22023', message: 'plan not available' }, 400),
  });
  const r1 = await handleCheckout(post({ planCode: 'fleet_monthly' }), unavailable.deps);
  assert.deepEqual([r1.status, await r1.json()], [409, { code: 'plan_unavailable' }]);
  const subscribed = setup({
    context: () => ok({ code: '55000', message: 'subscription already in force' }, 400),
  });
  const r2 = await handleCheckout(post({ planCode: 'fleet_monthly' }), subscribed.deps);
  assert.deepEqual([r2.status, await r2.json()], [409, { code: 'already_subscribed' }]);
});

Deno.test('the Gerente gets a Checkout URL; the customer is created and linked once', async () => {
  const { deps, stripeLog, calls } = setup();
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: 'https://checkout.stripe.test/s/1' });
  assert.equal(stripeLog[0], `customer ${COMPANY} customer-${COMPANY}`);
  assert.match(stripeLog[1] ?? '', /"customer":"cus_new"/u);
  assert.match(stripeLog[1] ?? '', /"price":"price_fleet"/u);
  assert.match(stripeLog[1] ?? '', /suscripcion\?estado=ok/u);
  assert.match(stripeLog[1] ?? '', /suscripcion\?estado=cancelado/u);
  assert.match(stripeLog[1] ?? '', /checkout-b4400000-0000-4000-8000-00000000000e$/u);
  assert.match(stripeLog[1] ?? '', /"expiresAt":1800002100/u);
  const save = calls.find((c) => c.url.endsWith('/rpc/billing_save_checkout_service'));
  assert.deepEqual(save?.body, {
    p_company_id: COMPANY,
    p_lease_id: 'b4400000-0000-4000-8000-00000000000e',
    p_price_id: 'price_fleet',
    p_session_id: 'cs_test_1',
    p_url: 'https://checkout.stripe.test/s/1',
    p_expires_at: new Date(1_800_002_100_000).toISOString(),
  });
  const link = calls.find((c) => c.url.endsWith('/rpc/billing_link_customer_service'));
  assert.deepEqual(link?.body, { p_company_id: COMPANY, p_customer_id: 'cus_new' });
});

Deno.test('a linked customer is reused', async () => {
  const { deps, stripeLog, calls } = setup({
    context: () =>
      ok([{ company_id: COMPANY, stripe_customer_id: 'cus_old', stripe_price_id: 'price_fleet' }]),
  });
  assert.equal((await handleCheckout(post({ planCode: 'fleet_monthly' }), deps)).status, 200);
  assert.equal(stripeLog[0], 'live? cus_old');
  assert.match(stripeLog[1] ?? '', /"customer":"cus_old"/u);
  assert.ok(!calls.some((c) => c.url.endsWith('/rpc/billing_link_customer_service')));
});

Deno.test('a live subscription in Stripe answers 409 already_subscribed', async () => {
  const { deps, stripeLog } = setup({
    context: () =>
      ok([{ company_id: COMPANY, stripe_customer_id: 'cus_old', stripe_price_id: 'price_fleet' }]),
    stripe: { live: true },
  });
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.deepEqual([response.status, await response.json()], [409, { code: 'already_subscribed' }]);
  assert.ok(!stripeLog.some((line) => line.startsWith('checkout')));
});

Deno.test('the stored session is reused while Stripe says it is open', async () => {
  const reuse = () =>
    ok([
      {
        action: 'reuse',
        session_id: 'cs_test_open',
        url: 'https://checkout.stripe.test/s/open',
        lease_id: null,
      },
    ]);
  const { deps, stripeLog } = setup({ begin: reuse });
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.deepEqual(await response.json(), { url: 'https://checkout.stripe.test/s/open' });
  assert.ok(stripeLog.includes('open? cs_test_open'));
  assert.ok(!stripeLog.some((line) => line.startsWith('checkout')));

  // Paid (or expired) meanwhile: dropped under the lock, and a new one is created.
  const paid = setup({
    begin: reuse,
    beginAgain: () =>
      ok([
        {
          action: 'create',
          session_id: null,
          url: null,
          lease_id: 'b4400000-0000-4000-8000-00000000000f',
        },
      ]),
    stripe: { open: false },
  });
  const again = await handleCheckout(post({ planCode: 'fleet_monthly' }), paid.deps);
  assert.deepEqual(await again.json(), { url: 'https://checkout.stripe.test/s/1' });
  const begins = paid.calls.filter((c) => c.url.endsWith('/rpc/billing_begin_checkout_service'));
  assert.equal(
    (begins[1]?.body as { p_discard_session_id?: string }).p_discard_session_id,
    'cs_test_open',
  );
  assert.match(paid.stripeLog.at(-1) ?? '', /checkout-b4400000-0000-4000-8000-00000000000f$/u);
});

Deno.test('the session being replaced is expired in Stripe before a new one', async () => {
  const replace = () =>
    ok([
      {
        action: 'create',
        session_id: 'cs_test_old',
        url: null,
        lease_id: 'b4400000-0000-4000-8000-00000000000e',
      },
    ]);
  const { deps, stripeLog } = setup({ begin: replace });
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.deepEqual(await response.json(), { url: 'https://checkout.stripe.test/s/1' });
  const expire = stripeLog.indexOf('expire cs_test_old');
  const create = stripeLog.findIndex((line) => line.startsWith('checkout'));
  assert.ok(expire >= 0 && expire < create, 'expired before creating');

  // Already paid: no new session.
  const paid = setup({ begin: replace, stripe: { paid: true } });
  const again = await handleCheckout(post({ planCode: 'fleet_monthly' }), paid.deps);
  assert.deepEqual([again.status, await again.json()], [409, { code: 'already_subscribed' }]);
  assert.ok(!paid.stripeLog.some((line) => line.startsWith('checkout')));
});

Deno.test('a session whose lease was taken over is never handed out', async () => {
  const { deps } = setup({ save: () => ok(false) });
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.deepEqual(
    [response.status, await response.json()],
    [409, { code: 'checkout_in_progress' }],
  );
});

Deno.test('a request while another creates the session gets 409 and creates nothing', async () => {
  const { deps, stripeLog } = setup({
    begin: () => ok([{ action: 'busy', session_id: null, url: null, lease_id: null }]),
  });
  const response = await handleCheckout(post({ planCode: 'fleet_monthly' }), deps);
  assert.deepEqual(
    [response.status, await response.json()],
    [409, { code: 'checkout_in_progress' }],
  );
  assert.ok(!stripeLog.some((line) => line.startsWith('checkout')));
});

Deno.test('invalid requests are refused', async () => {
  const { deps } = setup();
  assert.equal((await handleCheckout(post({ planCode: 'fleet_monthly' }, null), deps)).status, 401);
  assert.equal((await handleCheckout(post({ planCode: '../x' }), deps)).status, 400);
  assert.equal((await handleCheckout(post([]), deps)).status, 400);
  const noUser = setup({ user: () => ok({ message: 'bad jwt' }, 401) });
  assert.equal(
    (await handleCheckout(post({ planCode: 'fleet_monthly' }), noUser.deps)).status,
    401,
  );
  const get = new Request('http://functions.test/billing-checkout', { method: 'GET' });
  assert.equal((await handleCheckout(get, deps)).status, 405);
  const noSite = setup({ env: { SITE_URL: 'ftp://x' } });
  assert.equal(
    (await handleCheckout(post({ planCode: 'fleet_monthly' }), noSite.deps)).status,
    500,
  );
});
