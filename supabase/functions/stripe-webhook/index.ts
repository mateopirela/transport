// Edge Function `stripe-webhook` (H3). The logic lives in handler.ts (tested
// with `deno test`); this file only wires the Deno runtime, the real Stripe
// (loaded only with both Stripe secrets), the structured logs and Sentry
// (B25, optional: SENTRY_DSN). verify_jwt is off (supabase/config.toml): the
// Stripe signature is the credential.
import { observe } from '../_shared/observability.ts';
import { sentryReporter } from '../_shared/sentry.ts';
import { createBillingStripe } from '../_shared/stripe.ts';
import { CORS_HEADERS, handleStripeWebhook } from './handler.ts';

const env = (name: string) => Deno.env.get(name);

Deno.serve(
  observe(
    'stripe-webhook',
    (request, log) =>
      handleStripeWebhook(request, {
        env,
        fetch: (input, init) => fetch(input, init),
        stripe: (secretKey, webhookSecret) => createBillingStripe(secretKey, webhookSecret),
        log,
      }),
    { env, reporter: await sentryReporter(env), errorHeaders: CORS_HEADERS },
  ),
);
