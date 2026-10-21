// The real Stripe behind BillingStripe (H3). The SDK and the API version are
// pinned: a new version is a reviewed change (docs/release.md §3.1). The SDK
// is only loaded when STRIPE_SECRET_KEY exists; without it the functions
// answer 503 before getting here.
import type { BillingStripe, SubscriptionSnapshot } from './billing.ts';

export const STRIPE_SDK = 'npm:stripe@22.6.2';
/** The API version of stripe@22.6.2. */
export const STRIPE_API_VERSION = '2026-08-26.dahlia';

type StripeModule = typeof import('npm:stripe@22.6.2');

function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

/** A subscription that still counts (Stripe cannot revive a canceled or expired one). */
const isLive = (status: string) => status !== 'canceled' && status !== 'incomplete_expired';

export async function createBillingStripe(
  secretKey: string,
  webhookSecret?: string,
): Promise<BillingStripe> {
  const { default: Stripe } = (await import('npm:stripe@22.6.2')) as StripeModule;
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
  const crypto = Stripe.createSubtleCryptoProvider();

  return {
    async createCustomer(companyId, idempotencyKey) {
      const customer = await stripe.customers.create(
        { metadata: { company_id: companyId } },
        { idempotencyKey },
      );
      return customer.id;
    },
    async createCheckoutSession(params, idempotencyKey) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: params.customer,
          client_reference_id: params.companyId,
          line_items: [{ price: params.price, quantity: 1 }],
          subscription_data: { metadata: { company_id: params.companyId } },
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
          expires_at: params.expiresAt,
          locale: 'es-419',
        },
        { idempotencyKey },
      );
      if (!session.url) throw new Error('checkout session without url');
      return { id: session.id, url: session.url };
    },
    async expireCheckout(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === 'complete') return 'complete';
      if (session.status === 'open') {
        const expired = await stripe.checkout.sessions.expire(sessionId);
        // Paid between the read and the expiry: Stripe refuses or reports it.
        if (expired.status === 'complete') return 'complete';
      }
      return 'expired';
    },
    async isCheckoutOpen(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return session.status === 'open';
    },
    async createPortalSession(params) {
      const session = await stripe.billingPortal.sessions.create({
        customer: params.customer,
        return_url: params.returnUrl,
        locale: 'es-419',
      });
      return session.url;
    },
    async hasLiveSubscription(customer) {
      const list = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 });
      return list.data.some((s) => isLive(s.status));
    },
    async currentSubscription(customer): Promise<SubscriptionSnapshot | null> {
      const list = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 });
      const newest = [...list.data].sort((a, b) => b.created - a.created);
      const subscription = newest.find((s) => isLive(s.status)) ?? newest[0];
      if (!subscription) return null;
      const item = subscription.items.data[0];
      return {
        id: subscription.id,
        customer: idOf(subscription.customer) ?? customer,
        status: subscription.status,
        priceId: item?.price?.id ?? null,
        currentPeriodEnd: item?.current_period_end ?? null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
    },
    async verifyEvent(rawBody, signature) {
      if (!webhookSecret) throw new Error('webhook secret missing');
      const event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
        undefined,
        crypto,
      );
      return {
        id: event.id,
        type: event.type,
        created: event.created,
        object: event.data.object as unknown as Record<string, unknown>,
      };
    },
  };
}
