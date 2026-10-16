import * as Sentry from '@sentry/nextjs';

import { webSentrySettings } from '@/lib/sentry';

// Browser Sentry (B25): runs before the app becomes interactive. No-op
// without a DSN. No session replay: screens show personal data (LFPDPPP).
const settings = webSentrySettings();
if (settings) Sentry.init(settings);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
