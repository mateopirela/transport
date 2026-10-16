// Sentry for the Edge Functions (B25). Optional: without a valid SENTRY_DSN
// the SDK is not even loaded and errors only go to the structured logs.
// Default integrations are off (Supabase guidance: they assume a long-lived
// Deno process), so each error is captured explicitly by observe() and
// flushed before the response, while the isolate is still alive.
import { sentrySettings } from '../../../packages/shared/src/observability/sentry.ts';

import type { ErrorReporter } from './observability.ts';

const FLUSH_TIMEOUT_MS = 2000;

export async function sentryReporter(
  env: (name: string) => string | undefined,
): Promise<ErrorReporter | null> {
  const settings = sentrySettings({
    dsn: env('SENTRY_DSN'),
    environment: env('SENTRY_ENVIRONMENT'),
    release: env('SENTRY_RELEASE'),
    tracesSampleRate: env('SENTRY_TRACES_SAMPLE_RATE'),
  });
  if (!settings) return null;

  const Sentry = await import('npm:@sentry/deno@11.7.0');
  Sentry.init({ ...settings, defaultIntegrations: false });
  const region = env('SB_REGION');
  if (region) Sentry.setTag('region', region);

  return {
    async capture(error, tags) {
      Sentry.withScope((scope) => {
        scope.setTags(tags);
        const executionId = env('SB_EXECUTION_ID');
        if (executionId) scope.setTag('execution_id', executionId);
        Sentry.captureException(error);
      });
      await Sentry.flush(FLUSH_TIMEOUT_MS);
    },
  };
}
