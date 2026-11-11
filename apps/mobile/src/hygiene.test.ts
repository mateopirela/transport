import { findHygieneViolations, findStrictHygieneViolations } from '@transport/shared';
import { describe, expect, it } from 'vitest';

/**
 * The hygiene of "Fulmis" (docs/plan-fulmis.md §0.4): no screen or component
 * writes a colour, a font size or a radius by hand, and nothing of the older
 * themes is left. Only the kit and the theme hold those values, and not even
 * they cast a shadow, name the previous family or keep a colour of the
 * previous palette.
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

/** The theme and the kit: where the values live. */
const KIT = new Set([
  'theme.tsx',
  'components/ui.tsx',
  'components/tab-bar.tsx',
  'components/sheet.tsx',
]);

describe('hygiene', () => {
  const all = Object.keys(SOURCES).map((path) => path.replace(/^\.\//u, ''));
  const files = all.filter((file) => !KIT.has(file));

  it('walks the screens and components', () => {
    expect(files).toContain('app/_layout.tsx');
    expect(files).toContain('components/trip-sections.tsx');
  });

  it('leaves colours, font sizes and radii to the kit and the theme', () => {
    const found = files.flatMap((file) =>
      findHygieneViolations(SOURCES[`./${file}`] ?? '', 'mobile').map(
        (v) => `${file}:${v.line} ${v.rule} "${v.match}" (use ${v.hint})`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('walks the kit and the theme too', () => {
    for (const file of KIT) expect(all).toContain(file);
  });

  it('has no shadow, nor the previous family or palette, anywhere: the kit has no exception', () => {
    const found = all.flatMap((file) =>
      findStrictHygieneViolations(SOURCES[`./${file}`] ?? '', 'mobile').map(
        (v) => `${file}:${v.line} ${v.rule} "${v.match}" (use ${v.hint})`,
      ),
    );
    expect(found).toEqual([]);
  });
});
