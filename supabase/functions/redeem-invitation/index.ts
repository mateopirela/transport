// Edge Function `redeem-invitation` (G2). The logic lives in handler.ts
// (tested with `deno test`); this file only wires the Deno runtime, the
// structured logs and Sentry (B25, optional: SENTRY_DSN). verify_jwt is off
// (supabase/config.toml): the caller has no account yet; the invitation
// token is the credential and the database validates it.
import { observe } from '../_shared/observability.ts';
import { sentryReporter } from '../_shared/sentry.ts';
import { CORS_HEADERS, handleRedeem } from './handler.ts';

const env = (name: string) => Deno.env.get(name);

Deno.serve(
  observe(
    'redeem-invitation',
    (request, log) =>
      handleRedeem(request, { env, fetch: (input, init) => fetch(input, init), log }),
    { env, reporter: await sentryReporter(env), errorHeaders: CORS_HEADERS },
  ),
);
