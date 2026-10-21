// deno test supabase/functions/stripe-webhook — Edge Function `stripe-webhook`
// (H3). The signature is checked by the real Stripe SDK (no network: only
// HMAC) with headers made by generateTestHeaderString; Stripe's API and
// PostgREST are simulated.
import assert from 'node:assert/strict';

import Stripe from 'npm:stripe@22.6.2';

import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import type { SubscriptionSnapshot } from '../_shared/billing.ts';
import { createBillingStripe } from '../_shared/stripe.ts';
import { customerOf, type Dependencies, handleStripeWebhook } from './handler.ts';

const SECRET = 'whsec_test_secret';

const subscription: SubscriptionSnapshot = {
  id: 'sub_test1',
  customer: 'cus_test1',
  status: 'active',
  priceId: 'price_test1',
  currentPeriodEnd: 1_800_000_000,
  cancelAtPeriodEnd: false,
};

function eventBody(type: string, object: Record<string, unknown>, id = 'evt_test1') {
  return JSON.stringify({ id, object: 'event', type, created: 1_790_000_000, data: { object } });
}

async function signed(payload: string, secret = SECRET): Promise<string> {
  return await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
}

function setup(
  options: {
    env?: Record<string, string | undefined>;
    apply?: () => Response;
    current?: (customer: string) => Promise<SubscriptionSnapshot | null>;
  } = {},
) {
  const rpcBodies: Record<string, unknown>[] = [];
  const retrieved: string[] = [];
  const lines: string[] = [];
  const env: Record<string, string | undefined> = {
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: SECRET,
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...options.env,
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    now: () => 1_795_000_000_000,
    log: createLogger({ service: 'test', sink: (_level, line) => lines.push(line) }),
    fetch: async (url, init) => {
      assert.ok(url.endsWith('/rpc/billing_apply_event_service'), `unexpected ${url}`);
      rpcBodies.push(JSON.parse(String(init.body)));
      return (options.apply ?? (() => new Response(JSON.stringify('applied'), { status: 200 })))();
    },
    stripe: async (key, webhookSecret) => {
      const real = await createBillingStripe(key, webhookSecret);
      return {
        ...real,
        currentSubscription: async (customer) => {
          retrieved.push(customer);
          return (options.current ?? (async () => subscription))(customer);
        },
      };
    },
  };
  return { deps, rpcBodies, retrieved, lines };
}

const post = (body: string, signature?: string) =>
  new Request('http://functions.test/stripe-webhook', {
    method: 'POST',
    headers: signature ? { 'Stripe-Signature': signature } : {},
    body,
  });

Deno.test('without the Stripe secrets it answers 503 billing_disabled', async () => {
  for (const missing of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    const { deps, rpcBodies } = setup({ env: { [missing]: undefined } });
    const body = eventBody('customer.subscription.updated', { id: 'sub_test1' });
    const response = await handleStripeWebhook(post(body, await signed(body)), deps);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: 'billing_disabled' });
    assert.equal(rpcBodies.length, 0);
  }
});

Deno.test('a valid signature applies the subscription read from Stripe', async () => {
  const { deps, rpcBodies, retrieved } = setup();
  // A delayed event of an old subscription of the customer: what gets stored
  // is the customer's current subscription, read from Stripe.
  const body = eventBody('customer.subscription.updated', {
    id: 'sub_old',
    customer: 'cus_test1',
    status: 'canceled',
  });
  const response = await handleStripeWebhook(post(body, await signed(body)), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, result: 'applied' });
  assert.deepEqual(retrieved, ['cus_test1']);
  assert.deepEqual(rpcBodies[0], {
    p_event_id: 'evt_test1',
    p_event_type: 'customer.subscription.updated',
    // The time the subscription was read, not the event's: snapshots are ordered by it.
    p_fetched_at: new Date(1_795_000_000_000).toISOString(),
    // The subscription and its status come from Stripe, not from the event body.
    p_customer_id: 'cus_test1',
    p_subscription_id: 'sub_test1',
    p_stripe_status: 'active',
    p_price_id: 'price_test1',
    p_current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    p_cancel_at_period_end: false,
  });
});

Deno.test('an invalid or missing signature is refused before anything is read', async () => {
  const { deps, rpcBodies, retrieved } = setup();
  const body = eventBody('customer.subscription.updated', { id: 'sub_test1' });
  const forged = await signed(body, 'whsec_another_secret');
  assert.equal((await handleStripeWebhook(post(body, forged), deps)).status, 400);
  // A body changed after signing.
  const tampered = body.replace('sub_test1', 'sub_other');
  assert.equal((await handleStripeWebhook(post(tampered, await signed(body)), deps)).status, 400);
  assert.equal((await handleStripeWebhook(post(body), deps)).status, 400);
  assert.equal(rpcBodies.length, 0);
  assert.equal(retrieved.length, 0);
});

Deno.test('a repeated event answers 200 and the database ignores it', async () => {
  const { deps, rpcBodies } = setup({
    apply: () => new Response(JSON.stringify('duplicate'), { status: 200 }),
  });
  const body = eventBody('invoice.paid', { customer: 'cus_test1' });
  const response = await handleStripeWebhook(post(body, await signed(body)), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, result: 'duplicate' });
  assert.equal(rpcBodies.length, 1);
});

Deno.test('other events are acknowledged and ignored', async () => {
  const { deps, rpcBodies, retrieved } = setup();
  for (const body of [
    eventBody('customer.created', { id: 'cus_test1' }),
    eventBody('checkout.session.completed', { mode: 'payment', subscription: null }),
  ]) {
    const response = await handleStripeWebhook(post(body, await signed(body)), deps);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true, result: 'ignored' });
  }
  assert.equal(rpcBodies.length, 0);
  assert.equal(retrieved.length, 0);
});

Deno.test(
  'a failure reading Stripe or writing the database answers 500 (Stripe retries)',
  async () => {
    const body = eventBody('customer.subscription.deleted', {
      id: 'sub_test1',
      customer: 'cus_test1',
    });
    const stripeDown = setup({
      current: () => Promise.reject(new Error('stripe down')),
    });
    assert.equal(
      (await handleStripeWebhook(post(body, await signed(body)), stripeDown.deps)).status,
      500,
    );
    assert.equal(stripeDown.rpcBodies.length, 0);

    const dbDown = setup({
      apply: () => new Response(JSON.stringify({ code: '22023', message: 'x' }), { status: 400 }),
    });
    assert.equal(
      (await handleStripeWebhook(post(body, await signed(body)), dbDown.deps)).status,
      500,
    );
  },
);

Deno.test('customerOf reads each handled event', () => {
  const event = (type: string, object: Record<string, unknown>) => ({
    id: 'evt_1',
    type,
    created: 1,
    object,
  });
  assert.equal(
    customerOf(event('checkout.session.completed', { mode: 'subscription', customer: 'cus_a' })),
    'cus_a',
  );
  assert.equal(
    customerOf(event('checkout.session.completed', { mode: 'payment', customer: 'cus_a' })),
    null,
  );
  assert.equal(customerOf(event('customer.subscription.deleted', { customer: 'cus_b' })), 'cus_b');
  assert.equal(customerOf(event('invoice.payment_failed', { customer: { id: 'cus_c' } })), 'cus_c');
  assert.equal(customerOf(event('invoice.paid', {})), null);
  assert.equal(customerOf(event('charge.succeeded', { customer: 'cus_d' })), null);
});

Deno.test('a customer without subscriptions is acknowledged and nothing is stored', async () => {
  const { deps, rpcBodies } = setup({ current: async () => null });
  const body = eventBody('checkout.session.completed', {
    mode: 'subscription',
    customer: 'cus_test1',
  });
  const response = await handleStripeWebhook(post(body, await signed(body)), deps);
  assert.deepEqual(await response.json(), { received: true, result: 'ignored' });
  assert.equal(rpcBodies.length, 0);
});

Deno.test('the logs carry no ids, tokens or secrets', async () => {
  const { deps, lines } = setup();
  const body = eventBody('customer.subscription.updated', {
    id: 'sub_test1',
    customer: 'cus_test1',
  });
  await handleStripeWebhook(post(body, await signed(body)), deps);
  await handleStripeWebhook(post(body, 'v1=forged'), deps);
  const all = lines.join('\n');
  for (const secret of [SECRET, 'sub_test1', 'cus_test1', 'evt_test1', 'service-key']) {
    assert.ok(!all.includes(secret), `the logs leak ${secret}`);
  }
});
