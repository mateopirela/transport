import { readFileSync } from 'node:fs';

import { palette, typeScale, type Palette, type TypeName } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { themeChoiceFromCookie, themeClass, themeCookie } from './theme';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/** The declarations of the first block that opens with `selector {`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  const vars = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    vars.set(match[1] as string, (match[2] as string).trim());
  }
  return vars;
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** `#ABCDEF` and `rgba(1,2,3,0.5)` in one spelling, to compare CSS with the tokens. */
const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase();

describe('globals.css mirrors the design tokens', () => {
  const themes: [string, string, Palette][] = [
    ['light', ':root', palette.light],
    ['dark (system)', ':root:not(.light)', palette.dark],
    ['dark (cookie)', ':root.dark', palette.dark],
  ];

  it.each(themes)('%s', (_, selector, colors) => {
    const vars = block(selector);
    for (const [name, value] of Object.entries(colors)) {
      expect(normalize(vars.get(`--${kebab(name)}`) ?? 'missing'), name).toBe(normalize(value));
    }
  });

  it('declares the type scale in rem (17 px = 1.0625rem)', () => {
    const theme = block('@theme inline');
    const names: TypeName[] = Object.keys(typeScale) as TypeName[];
    for (const name of names) {
      const { size, lineHeight } = typeScale[name];
      expect(theme.get(`--text-${kebab(name)}`), name).toBe(`${size / 16}rem`);
      expect(theme.get(`--text-${kebab(name)}--line-height`), name).toBe(`${lineHeight / 16}rem`);
    }
  });

  it('has a single family and none of the deck values', () => {
    expect(css).toMatch(/--font-sans: var\(--font-hanken\)/);
    expect(css).not.toMatch(/Marcellus|Manrope|Georgia|oklch/);
  });
});

describe('theme cookie', () => {
  it('reads a valid choice and falls back to the system', () => {
    expect(themeChoiceFromCookie('dark')).toBe('dark');
    expect(themeChoiceFromCookie('light')).toBe('light');
    expect(themeChoiceFromCookie('system')).toBe('system');
    expect(themeChoiceFromCookie('purple')).toBe('system');
    expect(themeChoiceFromCookie(undefined)).toBe('system');
  });

  it('maps the choice to the class of <html>', () => {
    expect(themeClass('dark')).toBe('dark');
    expect(themeClass('light')).toBe('light');
    expect(themeClass('system')).toBe('');
  });

  it('writes a year-long, site-wide cookie, secure on https', () => {
    expect(themeCookie('dark', false)).toBe('theme=dark; Path=/; Max-Age=31536000; SameSite=Lax');
    expect(themeCookie('light', true)).toMatch(/; Secure$/);
  });
});
