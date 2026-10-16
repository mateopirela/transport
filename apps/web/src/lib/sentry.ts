import { sentrySettings, type SentrySettings } from '@transport/shared';

/**
 * Sentry options of the web app (browser, Node and edge runtimes), or null
 * when NEXT_PUBLIC_SENTRY_DSN is missing: then Sentry is never initialized.
 * Each variable is read with a static `process.env.NEXT_PUBLIC_*` access so
 * Next.js inlines it in the browser bundle. The DSN is public by design.
 */
export function webSentrySettings(): SentrySettings | null {
  return sentrySettings({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  });
}
