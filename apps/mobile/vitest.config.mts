import { defineConfig } from 'vitest/config';

// Unit tests cover the platform-independent logic in src/lib (no React Native
// runtime): storage chunking, routing, deep links, error mapping and auth flows.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
