// Edge Function `billing-checkout` (H3, D30): a Stripe Checkout session for
// the Gerente's company.
//
//   POST { planCode } with the user's JWT → { url }
//
// 1. Without STRIPE_SECRET_KEY: 503 { code: 'billing_disabled' } (the pilot
//    is free and nothing fails).
// 2. The user comes from the JWT (Auth `/user`).
// 3. billing_session_context_service (service role only) checks that the user
//    is the Gerente, that the pilot is over (409 pilot_active), that the plan
//    is offered to the company and that it has no subscription in force; it
//    returns the company, its customer and the Stripe price.
// 4. The customer is created once (idempotency key by company) and linked
//    with billing_link_customer_service, which keeps the first one.
// 5. A customer that already has a live subscription in Stripe (even one the
//    webhook has not stored yet) gets 409 already_subscribed.
// 6. One Checkout session per company at a time
//    (billing_begin_checkout_service, under the company's row lock): the
//    stored one is reused while Stripe says it is still open (a paid or
//    expired one is dropped, and one being replaced is expired in Stripe
//    first), a request that arrives while another creates it gets 409
//    checkout_in_progress, and only the holder of the lease creates it (the
//    lease id is the Stripe idempotency key) and saves it. A retry or a second
//    tab never opens a second session, so never a second subscription.
// 7. The session expires in 35 minutes and comes back to
//    /transportista/suscripcion?estado=ok|cancelado.
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';
import {
  billingDisabled,
  type BillingStripe,
  CORS_HEADERS,
  contextErrorResponse,
  type FetchLike,
  json,
  requestSetup,
  type SessionContext,
  serviceRpc,
  siteUrlOf,
  SUBSCRIPTION_PATH,
  userIdOf,
} from '../_shared/billing.ts';

export { CORS_HEADERS };

export interface Dependencies {
  env: (name: string) => string | undefined;
  fetch: FetchLike;
  stripe: (secretKey: string) => Promise<BillingStripe>;
  now?: () => number;
  log?: Logger;
}

const PLAN_CODE = /^[a-z0-9_]{3,40}$/u;
/** Stripe accepts 30 minutes to 24 hours; a short life keeps one session at a time. */
const SESSION_LIFETIME_S = 35 * 60;

function parsePlanCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { planCode } = body as Record<string, unknown>;
  return typeof planCode === 'string' && PLAN_CODE.test(planCode) ? planCode : null;
}

export async function handleCheckout(request: Request, deps: Dependencies): Promise<Response> {
  const log = deps.log ?? createLogger({ service: 'billing-checkout' });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);

  const secretKey = deps.env('STRIPE_SECRET_KEY');
  if (!secretKey) return billingDisabled();

  const setup = requestSetup(request, deps.env);
  if (setup instanceof Response) return setup;
  const siteUrl = siteUrlOf(deps.env);
  if (!siteUrl) return json({ code: 'not_configured' }, 500);

  let planCode: string | null = null;
  try {
    planCode = parsePlanCode(await request.json());
  } catch {
    // Invalid JSON: same answer as an invalid body.
  }
  if (!planCode) return json({ code: 'invalid_request' }, 400);

  try {
    const userId = await userIdOf(
      setup.supabaseUrl,
      setup.anonKey,
      setup.authorization,
      deps.fetch,
    );
    if (!userId) return json({ code: 'unauthorized' }, 401);

    const context = await serviceRpc<SessionContext[]>(
      setup.supabaseUrl,
      setup.serviceKey,
      'billing_session_context_service',
      { p_user_id: userId, p_plan_code: planCode },
      deps.fetch,
    );
    if (context.error) {
      const refusal = contextErrorResponse(context.error);
      if (refusal) return refusal;
      log.error('billing_session_context_service failed', {
        status: context.error.status,
        code: context.error.code,
      });
      return json({ code: 'upstream_error' }, 502);
    }
    const row = context.data[0];
    if (!row?.stripe_price_id) return json({ code: 'plan_unavailable' }, 409);

    const stripe = await deps.stripe(secretKey);
    let customer = row.stripe_customer_id;
    if (!customer) {
      const created = await stripe.createCustomer(row.company_id, `customer-${row.company_id}`);
      const linked = await serviceRpc<string>(
        setup.supabaseUrl,
        setup.serviceKey,
        'billing_link_customer_service',
        { p_company_id: row.company_id, p_customer_id: created },
        deps.fetch,
      );
      if (linked.error) {
        log.error('billing_link_customer_service failed', {
          status: linked.error.status,
          code: linked.error.code,
        });
        return json({ code: 'upstream_error' }, 502);
      }
      customer = linked.data;
    }

    if (row.stripe_customer_id && (await stripe.hasLiveSubscription(customer))) {
      return json({ code: 'already_subscribed' }, 409);
    }

    type Begin = {
      action: string;
      session_id: string | null;
      url: string | null;
      lease_id: string | null;
    };
    const begin = async (discard: string | null) =>
      serviceRpc<Begin[]>(
        setup.supabaseUrl,
        setup.serviceKey,
        'billing_begin_checkout_service',
        {
          p_company_id: row.company_id,
          p_price_id: row.stripe_price_id,
          p_discard_session_id: discard,
        },
        deps.fetch,
      );
    let begun = await begin(null);
    // The stored session is reused only while Stripe says it is open; a paid
    // or expired one is dropped (under the same lock) and a new one created.
    const stored = begun.data?.[0];
    if (stored?.action === 'reuse' && stored.session_id && stored.url) {
      if (await stripe.isCheckoutOpen(stored.session_id)) return json({ url: stored.url });
      begun = await begin(stored.session_id);
    }
    if (begun.error) {
      log.error('billing_begin_checkout_service failed', {
        status: begun.error.status,
        code: begun.error.code,
      });
      return json({ code: 'upstream_error' }, 502);
    }
    const lease = begun.data[0];
    if (lease?.action === 'reuse' && lease.url) return json({ url: lease.url });
    if (lease?.action !== 'create' || !lease.lease_id) {
      return json({ code: 'checkout_in_progress' }, 409);
    }
    // The session this one replaces (a different price, or about to expire)
    // is closed first: two payable sessions never overlap. Already paid: the
    // subscription is on its way (the webhook stores it).
    if (lease.session_id && (await stripe.expireCheckout(lease.session_id)) === 'complete') {
      return json({ code: 'already_subscribed' }, 409);
    }

    const expiresAt = Math.floor((deps.now ?? Date.now)() / 1000) + SESSION_LIFETIME_S;
    const session = await stripe.createCheckoutSession(
      {
        customer,
        price: row.stripe_price_id,
        companyId: row.company_id,
        successUrl: `${siteUrl}${SUBSCRIPTION_PATH}?estado=ok`,
        cancelUrl: `${siteUrl}${SUBSCRIPTION_PATH}?estado=cancelado`,
        expiresAt,
      },
      `checkout-${lease.lease_id}`,
    );
    const saved = await serviceRpc<boolean>(
      setup.supabaseUrl,
      setup.serviceKey,
      'billing_save_checkout_service',
      {
        p_company_id: row.company_id,
        p_lease_id: lease.lease_id,
        p_price_id: row.stripe_price_id,
        p_session_id: session.id,
        p_url: session.url,
        p_expires_at: new Date(expiresAt * 1000).toISOString(),
      },
      deps.fetch,
    );
    // Only a session stored as the company's one outstanding session is handed
    // out: if the lease ran out meanwhile (another request took over), this
    // one is never shown, so it cannot be paid next to the other.
    if (saved.error) {
      log.error('billing_save_checkout_service failed', {
        status: saved.error.status,
        code: saved.error.code,
      });
      return json({ code: 'upstream_error' }, 502);
    }
    if (saved.data !== true) return json({ code: 'checkout_in_progress' }, 409);
    return json({ url: session.url });
  } catch (error) {
    log.error('billing-checkout failed', { error });
    return json({ code: 'upstream_error' }, 502);
  }
}
