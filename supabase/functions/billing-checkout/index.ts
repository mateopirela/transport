// Edge Function `billing-checkout` (H3). The logic lives in handler.ts (tested
// with `deno test`); this file only wires the Deno runtime, the real Stripe
// (loaded only with STRIPE_SECRET_KEY), the structured logs and Sentry (B25,
// optional: SENTRY_DSN). verify_jwt stays on: only signed-in users reach it.
import { observe } from '../_shared/observability.ts';
import { sentryReporter } from '../_shared/sentry.ts';
import { createBillingStripe } from '../_shared/stripe.ts';
import { CORS_HEADERS, handleCheckout } from './handler.ts';

const env = (name: string) => Deno.env.get(name);

Deno.serve(
  observe(
    'billing-checkout',
    (request, log) =>
      handleCheckout(request, {
        env,
        fetch: (input, init) => fetch(input, init),
        stripe: (secretKey) => createBillingStripe(secretKey),
        log,
      }),
    { env, reporter: await sentryReporter(env), errorHeaders: CORS_HEADERS },
  ),
);
