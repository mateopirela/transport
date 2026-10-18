// Edge Function `shared-document-url` (G6). The logic lives in handler.ts
// (tested with `deno test`); this file only wires the Deno runtime, the
// structured logs and Sentry (B25, optional: SENTRY_DSN).
import { observe } from '../_shared/observability.ts';
import { sentryReporter } from '../_shared/sentry.ts';
import { CORS_HEADERS, handleSharedDocumentUrl } from './handler.ts';

const env = (name: string) => Deno.env.get(name);

Deno.serve(
  observe(
    'shared-document-url',
    (request, log) =>
      handleSharedDocumentUrl(request, { env, fetch: (input, init) => fetch(input, init), log }),
    { env, reporter: await sentryReporter(env), errorHeaders: CORS_HEADERS },
  ),
);
