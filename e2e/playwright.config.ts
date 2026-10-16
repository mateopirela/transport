import { defineConfig, devices } from '@playwright/test';

import { baseURL } from './support/env';

// End-to-end suite (B26). Runs against the local stack: `supabase start`
// (migrations + demo seed) and the web app built with its URL and anon key.
// The specs change the demo data, so they run one at a time, without retries,
// on a freshly seeded database (`supabase db reset`). See e2e/README.md.

const { hostname, port } = new URL(baseURL);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // E2E_WEB_SERVER=off: the web app is already running at E2E_BASE_URL.
  ...(process.env.E2E_WEB_SERVER === 'off'
    ? {}
    : {
        webServer: {
          command: `pnpm --filter @transport/web start --hostname ${hostname} --port ${port || '3000'}`,
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      }),
});
