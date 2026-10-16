import * as Sentry from '@sentry/react-native';
import { sentrySettings } from '@transport/shared';

// Sentry of the app (B25). Optional: without a valid EXPO_PUBLIC_SENTRY_DSN
// it is never initialized and every call below is a no-op. The DSN is public
// by design. Events are scrubbed (no emails, positions or tokens) by the
// shared beforeSend; no session replay (screens show personal data).
const settings = sentrySettings({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? 'development' : undefined),
  tracesSampleRate: process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
});

export const sentryEnabled = settings !== null;

if (settings) Sentry.init(settings);

/** Reports a handled error (e.g. a screen that failed to render). */
export function reportError(error: unknown, tags?: Record<string, string>): void {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    if (tags) scope.setTags(tags);
    Sentry.captureException(error);
  });
}

/** Only ids travel to Sentry (scrubEvent drops anything else). */
export function setSentryUser(user: { id: string; role: string } | null): void {
  if (sentryEnabled) Sentry.setUser(user);
}

/** Root component wrapper: native crash and touch breadcrumbs when enabled. */
export function withSentry(component: React.ComponentType<Record<string, unknown>>) {
  return sentryEnabled ? Sentry.wrap(component) : component;
}
