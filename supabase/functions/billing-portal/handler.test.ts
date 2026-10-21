// deno test supabase/functions/billing-portal — Edge Function `billing-portal`
// (H3) with simulated Auth, PostgREST and Stripe (no network, no keys).
import assert from 'node:assert/strict';

import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import type { BillingStripe } from '../_shared/billing.ts';
import { type Dependencies, handlePortal } from './handler.ts';

const USER = 'a4400000-0000-4000-8000-000000000002';
const COMPANY = 'c4400000-0000-4000-8000-000000000002';

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(
  options: { env?: Record<string, string | undefined>; context?: () => Response } = {},
) {
  const portals: { customer: string; returnUrl: string }[] = [];
  const calls: { url: string; body: unknown }[] = [];
  const env: Record<string, string | undefined> = {
    STRIPE_SECRET_KEY: 'sk_test_x',
    SITE_URL: 'https://transport.test/',
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...options.env,
  };
  const stripe: BillingStripe = {
    createCustomer: () => Promise.reject(new Error('not expected')),
    createCheckoutSession: () => Promise.reject(new Error('not expected')),
    createPortalSession: async (params) => {
      portals.push(params);
      return 'https://billing.stripe.test/p/1';
    },
    hasLiveSubscription: () => Promise.reject(new Error('not expected')),
    isCheckoutOpen: () => Promise.reject(new Error('not expected')),
    expireCheckout: () => Promise.reject(new Error('not expected')),
    currentSubscription: () => Promise.reject(new Error('not expected')),
    verifyEvent: () => Promise.reject(new Error('not expected')),
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    log: createLogger({ service: 'test', sink: () => {} }),
    stripe: async () => stripe,
    fetch: async (url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith('/auth/v1/user')) return ok({ id: USER });
      if (url.endsWith('/rpc/billing_session_context_service')) {
        return (
          options.context ??
          (() => ok([{ company_id: COMPANY, stripe_customer_id: 'cus_1', stripe_price_id: null }]))
        )();
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  return { deps, portals, calls };
}

const post = (token: string | null = 'user-jwt') =>
  new Request('http://functions.test/billing-portal', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: '{}',
  });

Deno.test('without STRIPE_SECRET_KEY it answers 503 billing_disabled', async () => {
  const { deps, calls } = setup({ env: { STRIPE_SECRET_KEY: undefined } });
  const response = await handlePortal(post(), deps);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'billing_disabled' });
  assert.equal(calls.length, 0);
});

Deno.test('the Gerente gets a Portal URL that comes back to the subscription page', async () => {
  const { deps, portals, calls } = setup();
  const response = await handlePortal(post(), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: 'https://billing.stripe.test/p/1' });
  assert.deepEqual(portals, [
    { customer: 'cus_1', returnUrl: 'https://transport.test/transportista/suscripcion' },
  ]);
  const context = calls.find((c) => c.url.endsWith('/rpc/billing_session_context_service'));
  assert.deepEqual(context?.body, { p_user_id: USER, p_plan_code: null });
});

Deno.test('only the Gerente of the company opens the Portal', async () => {
  const { deps, portals } = setup({
    context: () =>
      ok({ code: '42501', message: 'only the manager can manage the subscription' }, 403),
  });
  const response = await handlePortal(post(), deps);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: 'forbidden' });
  assert.equal(portals.length, 0);
});

Deno.test('a company that never paid has no customer: 409 no_customer', async () => {
  const { deps, portals } = setup({
    context: () => ok([{ company_id: COMPANY, stripe_customer_id: null, stripe_price_id: null }]),
  });
  const response = await handlePortal(post(), deps);
  assert.deepEqual([response.status, await response.json()], [409, { code: 'no_customer' }]);
  assert.equal(portals.length, 0);
});

Deno.test('without a session it answers 401', async () => {
  const { deps } = setup();
  assert.equal((await handlePortal(post(null), deps)).status, 401);
});
