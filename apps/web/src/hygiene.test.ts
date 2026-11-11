import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findHygieneViolations, findStrictHygieneViolations } from '@transport/shared';
import { describe, expect, it } from 'vitest';

/**
 * The hygiene of "Fulmis" (docs/plan-fulmis.md §0.4): no page or component
 * writes a colour, a font size or a radius by hand (the Tailwind classes sit
 * on the tokens), and nothing of the older themes is left. Only the kit and
 * globals.css hold those values, and not even they cast a shadow, name the
 * previous family or keep a colour of the previous palette.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url));

/** The kit and the tokens: where the values live. */
const isKit = (file: string) => file.startsWith('components/ui/') || file === 'app/globals.css';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

describe('hygiene', () => {
  const all = sourceFiles(SRC).map((path) => relative(SRC, path).split(sep).join('/'));
  const files = all.filter((file) => !isKit(file));

  it('walks the pages and components', () => {
    expect(files).toContain('app/layout.tsx');
    expect(files).toContain('components/app-shell.tsx');
  });

  it('leaves colours, font sizes and radii to the kit and the tokens', () => {
    const found = files.flatMap((file) =>
      findHygieneViolations(readFileSync(join(SRC, file), 'utf8'), 'web').map(
        (v) => `${file}:${v.line} ${v.rule} "${v.match}" (use ${v.hint})`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('walks the kit and the tokens too', () => {
    expect(all).toContain('app/globals.css');
    expect(all).toContain('components/ui/variants.ts');
    expect(all).toContain('components/ui/segmented.tsx');
  });

  it('has no shadow, nor the previous family or palette, anywhere: the kit has no exception', () => {
    const found = all.flatMap((file) =>
      findStrictHygieneViolations(readFileSync(join(SRC, file), 'utf8'), 'web').map(
        (v) => `${file}:${v.line} ${v.rule} "${v.match}" (use ${v.hint})`,
      ),
    );
    expect(found).toEqual([]);
  });
});
