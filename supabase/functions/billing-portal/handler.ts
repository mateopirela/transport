// Edge Function `billing-portal` (H3, D30): a Stripe Customer Portal session
// for the Gerente's company, to manage the payment method, see invoices or
// cancel.
//
//   POST {} with the user's JWT → { url }
//
// Without STRIPE_SECRET_KEY: 503 { code: 'billing_disabled' }. Only the
// Gerente (billing_session_context_service, service role only); a company
// that never went through Checkout has no customer: 409 no_customer. It works
// during the pilot too (a company may have subscribed before it).
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';
import {
  billingDisabled,
  type BillingStripe,
  contextErrorResponse,
  CORS_HEADERS,
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
  log?: Logger;
}

export async function handlePortal(request: Request, deps: Dependencies): Promise<Response> {
  const log = deps.log ?? createLogger({ service: 'billing-portal' });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);

  const secretKey = deps.env('STRIPE_SECRET_KEY');
  if (!secretKey) return billingDisabled();

  const setup = requestSetup(request, deps.env);
  if (setup instanceof Response) return setup;
  const siteUrl = siteUrlOf(deps.env);
  if (!siteUrl) return json({ code: 'not_configured' }, 500);

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
      { p_user_id: userId, p_plan_code: null },
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
    const customer = context.data[0]?.stripe_customer_id;
    if (!customer) return json({ code: 'no_customer' }, 409);

    const stripe = await deps.stripe(secretKey);
    const url = await stripe.createPortalSession({
      customer,
      returnUrl: `${siteUrl}${SUBSCRIPTION_PATH}`,
    });
    return json({ url });
  } catch (error) {
    log.error('billing-portal failed', { error });
    return json({ code: 'upstream_error' }, 502);
  }
}
