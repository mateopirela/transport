// Shared pieces of the billing Edge Functions (H3, D30): billing-checkout,
// billing-portal and stripe-webhook. Stripe is behind the BillingStripe
// interface (the real one in ./stripe.ts), so the handlers are tested with a
// fake and without network. Authorization lives in Postgres: the functions
// only call the *_service RPCs with the service role, and the user comes from
// their JWT (Auth `/user`), never from the body. Secrets, tokens and Stripe
// ids never reach the logs.

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** The answer when Stripe is not configured: the pilot is free (D30). */
export const billingDisabled = () => json({ code: 'billing_disabled' }, 503);

/** A Stripe subscription, reduced to what company_subscriptions stores. */
export interface SubscriptionSnapshot {
  id: string;
  customer: string;
  status: string;
  priceId: string | null;
  /** Unix seconds, or null. */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/** A verified Stripe event, reduced to what the webhook reads. */
export interface VerifiedEvent {
  id: string;
  type: string;
  /** Unix seconds. */
  created: number;
  object: Record<string, unknown>;
}

export interface BillingStripe {
  createCustomer(companyId: string, idempotencyKey: string): Promise<string>;
  createCheckoutSession(
    params: {
      customer: string;
      price: string;
      companyId: string;
      successUrl: string;
      cancelUrl: string;
      /** Unix seconds; Stripe takes 30 minutes to 24 hours from now. */
      expiresAt: number;
    },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string }>;
  /** Whether a Checkout session is still open (not paid, not expired). */
  isCheckoutOpen(sessionId: string): Promise<boolean>;
  /**
   * Closes a Checkout session so it can no longer be paid: 'expired' when it
   * was open (or had expired already), 'complete' when it was already paid.
   */
  expireCheckout(sessionId: string): Promise<'expired' | 'complete'>;
  createPortalSession(params: { customer: string; returnUrl: string }): Promise<string>;
  /** Whether the customer has a subscription that is not canceled or expired in Stripe. */
  hasLiveSubscription(customer: string): Promise<boolean>;
  /**
   * The customer's current subscription in Stripe: the newest live one (not
   * canceled or expired), or else the newest one; null without any.
   */
  currentSubscription(customer: string): Promise<SubscriptionSnapshot | null>;
  /** Verifies the Stripe-Signature over the raw body; throws when it does not match. */
  verifyEvent(rawBody: string, signature: string): Promise<VerifiedEvent>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** PostgREST headers for a key: new secret keys go only in `apikey`. */
export function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** The id of the JWT's user, or null when Auth does not accept the token. */
export async function userIdOf(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  fetch: FetchLike,
): Promise<string | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return typeof user?.id === 'string' && UUID.test(user.id) ? user.id : null;
}

export interface RpcError {
  status: number;
  code?: string;
  message?: string;
}

/** Calls a *_service RPC with the service role. */
export async function serviceRpc<T>(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
  args: Record<string, unknown>,
  fetch: FetchLike,
): Promise<{ data: T; error: null } | { data: null; error: RpcError }> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    return {
      data: null,
      error: { status: response.status, code: body.code, message: body.message },
    };
  }
  return { data: (await response.json()) as T, error: null };
}

export interface SessionContext {
  company_id: string;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
}

/**
 * The Response for an error of billing_session_context_service: only the
 * Gerente (403), the pilot (409), a subscription in force (409) or a plan not
 * offered (409); anything else is upstream.
 */
export function contextErrorResponse(error: RpcError): Response | null {
  if (error.code === '42501') return json({ code: 'forbidden' }, 403);
  if (error.code === '55000' && error.message === 'pilot active')
    return json({ code: 'pilot_active' }, 409);
  if (error.code === '55000') return json({ code: 'already_subscribed' }, 409);
  if (error.code === '22023') return json({ code: 'plan_unavailable' }, 409);
  return null;
}

/** The caller's Bearer token and the Supabase settings, or the Response that refuses. */
export function requestSetup(
  request: Request,
  env: (name: string) => string | undefined,
): { authorization: string; supabaseUrl: string; anonKey: string; serviceKey: string } | Response {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ code: 'unauthorized' }, 401);
  const supabaseUrl = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ code: 'not_configured' }, 500);
  return { authorization, supabaseUrl, anonKey, serviceKey };
}

/** The web's base URL (https, or http on localhost), without a trailing slash. */
export function siteUrlOf(env: (name: string) => string | undefined): string | null {
  const raw = env('SITE_URL')?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The page of the Gerente where Checkout and the Portal come back. */
export const SUBSCRIPTION_PATH = '/transportista/suscripcion';
