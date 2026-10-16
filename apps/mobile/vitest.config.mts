import { defineConfig } from 'vitest/config';

// Unit tests cover the platform-independent logic in src/lib (no React Native
// runtime): storage chunking, routing, deep links, error mapping and auth flows,
// plus the local config plugins (plugins/).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
    environment: 'node',
  },
});
