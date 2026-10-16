import * as Sentry from '@sentry/nextjs';

import { webSentrySettings } from '@/lib/sentry';

// Server-side Sentry (B25): Node and edge runtimes. No-op without a DSN.
export function register() {
  const settings = webSentrySettings();
  if (settings) Sentry.init(settings);
}

// Errors of Server Components, route handlers and server actions.
export const onRequestError = Sentry.captureRequestError;
