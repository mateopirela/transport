// Edge Function `stripe-webhook` (H3, D30): Stripe tells us that a
// subscription changed. verify_jwt is off (supabase/config.toml): the
// Stripe-Signature, checked with STRIPE_WEBHOOK_SECRET over the raw body, is
// the credential.
//
// 1. Without STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET: 503 billing_disabled.
// 2. A missing or wrong signature: 400, and nothing is read or written.
// 3. checkout.session.completed (subscription mode),
//    customer.subscription.created|updated|deleted, invoice.paid and
//    invoice.payment_failed name a customer; every other event is
//    acknowledged (200) and ignored.
// 4. The event is only a trigger: the webhook reads from Stripe the
//    customer's CURRENT subscription (a live one first, the newest otherwise),
//    never the one the event names, so a delayed event of an old subscription
//    cannot replace a newer one. billing_apply_event_service stores it for the
//    company linked to the customer, with the time the read started. That RPC
//    is idempotent by event id (a repeated event answers 200 and changes
//    nothing) and never lets a read that started earlier overwrite one that
//    started later (two webhooks that race).
// 5. A failure reading Stripe or writing the database answers 500, so Stripe
//    retries the event later. It also works during the pilot: the state is
//    stored, while the effective one stays "Piloto gratis".
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';
import {
  billingDisabled,
  type BillingStripe,
  CORS_HEADERS,
  type FetchLike,
  json,
  serviceRpc,
  type VerifiedEvent,
} from '../_shared/billing.ts';

export { CORS_HEADERS };

export interface Dependencies {
  env: (name: string) => string | undefined;
  fetch: FetchLike;
  stripe: (secretKey: string, webhookSecret: string) => Promise<BillingStripe>;
  now?: () => number;
  log?: Logger;
}

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

/** Stripe objects reference others by id, or expanded. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

/** The customer whose subscription an event may have changed, or null to ignore it. */
export function customerOf(event: VerifiedEvent): string | null {
  const object = event.object;
  switch (event.type) {
    case 'checkout.session.completed':
      return object.mode === 'subscription' ? idOf(object.customer) : null;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return idOf(object.customer);
    default:
      return null;
  }
}

const toIso = (seconds: number | null) =>
  seconds === null ? null : new Date(seconds * 1000).toISOString();

export async function handleStripeWebhook(request: Request, deps: Dependencies): Promise<Response> {
  const log = deps.log ?? createLogger({ service: 'stripe-webhook' });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);

  const secretKey = deps.env('STRIPE_SECRET_KEY');
  const webhookSecret = deps.env('STRIPE_WEBHOOK_SECRET');
  if (!secretKey || !webhookSecret) return billingDisabled();
  const supabaseUrl = deps.env('SUPABASE_URL');
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ code: 'not_configured' }, 500);

  const signature = request.headers.get('Stripe-Signature');
  if (!signature) return json({ code: 'invalid_signature' }, 400);
  // The raw body, byte for byte: the signature covers it.
  const rawBody = await request.text();

  const stripe = await deps.stripe(secretKey, webhookSecret);
  let event: VerifiedEvent;
  try {
    event = await stripe.verifyEvent(rawBody, signature);
  } catch {
    log.warn('stripe signature rejected');
    return json({ code: 'invalid_signature' }, 400);
  }

  const customer = customerOf(event);
  if (!customer) return json({ received: true, result: 'ignored' });

  try {
    // Taken before the read: the snapshot is at least this recent.
    const fetchedAt = new Date((deps.now ?? Date.now)()).toISOString();
    const subscription = await stripe.currentSubscription(customer);
    // A customer without subscriptions (e.g. a Checkout left unpaid): nothing to store.
    if (!subscription) return json({ received: true, result: 'ignored' });
    const applied = await serviceRpc<string>(
      supabaseUrl,
      serviceKey,
      'billing_apply_event_service',
      {
        p_event_id: event.id,
        p_event_type: event.type,
        p_fetched_at: fetchedAt,
        p_customer_id: subscription.customer,
        p_subscription_id: subscription.id,
        p_stripe_status: subscription.status,
        p_price_id: subscription.priceId,
        p_current_period_end: toIso(subscription.currentPeriodEnd),
        p_cancel_at_period_end: subscription.cancelAtPeriodEnd,
      },
      deps.fetch,
    );
    if (applied.error) {
      log.error('billing_apply_event_service failed', {
        status: applied.error.status,
        code: applied.error.code,
        type: event.type,
      });
      return json({ code: 'upstream_error' }, 500);
    }
    if (applied.data === 'unknown_customer') {
      log.warn('stripe event for a customer that is not linked', { type: event.type });
    }
    log.info('stripe event handled', { type: event.type, result: applied.data });
    return json({ received: true, result: applied.data });
  } catch (error) {
    log.error('stripe-webhook failed', { error, type: event.type });
    return json({ code: 'upstream_error' }, 500);
  }
}
