import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const stub = (name: string) => fileURLToPath(new URL(`./test/stubs/${name}`, import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        // The platform-independent logic in src/lib (no React Native runtime):
        // storage chunking, routing, deep links, error mapping and auth flows,
        // plus the local config plugins (plugins/).
        test: {
          name: 'logic',
          include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // The kit (components/*.test.tsx), rendered with react-test-renderer on
        // stand-ins of the native modules: React Native's components become
        // host elements whose props the tests read (test/stubs/).
        test: {
          name: 'kit',
          include: ['src/**/*.test.tsx'],
          environment: 'node',
        },
        oxc: { jsx: { runtime: 'automatic' } },
        resolve: {
          alias: [
            { find: /^react-native$/, replacement: stub('react-native.tsx') },
            { find: /^react-native-safe-area-context$/, replacement: stub('safe-area.tsx') },
            { find: /^@expo\/vector-icons\/Ionicons$/, replacement: stub('ionicons.tsx') },
            { find: /^expo-blur$/, replacement: stub('expo-blur.tsx') },
            { find: /^expo-secure-store$/, replacement: stub('secure-store.ts') },
            { find: /^@gorhom\/bottom-sheet$/, replacement: stub('bottom-sheet.tsx') },
            { find: /^@expo-google-fonts\/hanken-grotesk\/.*$/, replacement: stub('font.ts') },
          ],
        },
      },
    ],
  },
});
