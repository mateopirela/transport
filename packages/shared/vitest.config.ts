import { defineConfig } from 'vitest/config';

const STRICT = { statements: 90, branches: 90, functions: 90, lines: 90 };

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/db.ts'],
      reporter: ['text-summary', 'text'],
      // B02 acceptance: > 90 % coverage on state machines and validators.
      thresholds: {
        'src/state-machines.ts': STRICT,
        'src/rfc.ts': STRICT,
        'src/money.ts': STRICT,
        'src/schemas/**': STRICT,
      },
    },
  },
});
