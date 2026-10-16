import { defineConfig } from 'vitest/config';

// Only the pure helpers of the end-to-end suite run under Vitest (`pnpm test`).
// The Playwright specs in tests/ need the running stack: `pnpm e2e`.
export default defineConfig({
  test: { include: ['support/**/*.test.ts'] },
});
