import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findHygieneViolations } from '@transport/shared';
import { describe, expect, it } from 'vitest';

/**
 * The hygiene of "Transport · Nativo" (docs/plan-rediseno.md §0.3, U9): no
 * page or component writes a colour, a font size, a radius or a shadow by
 * hand (the Tailwind classes sit on the tokens), and nothing of the old theme
 * is left. Only the kit and globals.css hold those values.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url));

/** The kit (U6) and the tokens: where the values live. */
const isKit = (file: string) => file.startsWith('components/ui/') || file === 'app/globals.css';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

describe('hygiene', () => {
  const files = sourceFiles(SRC)
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .filter((file) => !isKit(file));

  it('walks the pages and components', () => {
    expect(files).toContain('app/layout.tsx');
    expect(files).toContain('components/app-shell.tsx');
  });

  it('leaves colours, font sizes, radii and shadows to the kit and the tokens', () => {
    const found = files.flatMap((file) =>
      findHygieneViolations(readFileSync(join(SRC, file), 'utf8'), 'web').map(
        (v) => `${file}:${v.line} ${v.rule} "${v.match}" (use ${v.hint})`,
      ),
    );
    expect(found).toEqual([]);
  });
});
