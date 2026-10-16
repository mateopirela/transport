import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared package ships TypeScript sources.
  transpilePackages: ['@transport/shared'],
  poweredByHeader: false,
};

// Sentry (B25). The runtime only reports when NEXT_PUBLIC_SENTRY_DSN is set
// (src/lib/sentry.ts). Source maps are uploaded only when the build has
// SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT (CI/Vercel, B27); without
// them the build works the same and nothing leaves the machine.
const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !uploadSourceMaps, deleteSourcemapsAfterUpload: true },
});
