import { findHygieneViolations } from '@transport/shared';
import { describe, expect, it } from 'vitest';

/**
 * The hygiene of "Transport · Nativo" (docs/plan-rediseno.md §0.3, U9): no
 * screen or component writes a colour, a font size, a radius or a shadow by
 * hand, and nothing of the old theme is left. Only the kit and the theme
 * hold those values.
 */
// Vite reads every source file of src as text when the test loads (the app has no Node types).
declare global {
  interface ImportMeta {
    glob(
      patterns: readonly string[],
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, string>;
  }
}

const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The theme and the kit (U2): where the values live. */
const KIT = new Set([
  'theme.tsx',
  'components/ui.tsx',
  'components/tab-bar.tsx',
  'components/sheet.tsx',
]);

describe('hygiene', () => {
  const files = Object.keys(SOURCES)
    .map((path) => path.replace(/^\.\//u, ''))
    .filter((file) => !KIT.has(file));

  it('walks the screens and components', () => {
    expect(files).toContain('app/_layout.tsx');
    expect(files).toContain('components/trip-sections.tsx');
  });

  it('leaves colours, font sizes, radii and shadows to the kit and the theme', () => {
    const found = files.flatMap((file) =>
      findHygieneViolations(SOURCES[`./${file}`] ?? '', 'mobile').map(
        (v) => `${file}:${v.line} ${v.rule} "${v.match}" (use ${v.hint})`,
      ),
    );
    expect(found).toEqual([]);
  });
});
