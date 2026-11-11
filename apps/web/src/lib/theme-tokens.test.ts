import { readFileSync } from 'node:fs';

import { palette, radii, shape, typeScale, type Palette, type TypeName } from '@transport/shared';
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

  it('declares every colour of the palette in each theme, and maps it to a class', () => {
    const theme = block('@theme inline');
    for (const [, selector, colors] of themes) {
      // Nothing but the palette: a colour the tokens do not know has no place here.
      expect([...block(selector).keys()].sort()).toEqual(
        Object.keys(colors)
          .map((name) => `--${kebab(name)}`)
          .sort(),
      );
    }
    for (const name of Object.keys(palette.light)) {
      expect(theme.get(`--color-${kebab(name)}`), name).toBe(`var(--${kebab(name)})`);
    }
  });

  it('keeps every colour opaque: nothing is glass', () => {
    expect(css).not.toMatch(/rgba?\(|hsla?\(|oklch\(/u);
  });

  it('declares the type scale in rem (17 px = 1.0625rem), with its weight and tracking', () => {
    const theme = block('@theme inline');
    const names: TypeName[] = Object.keys(typeScale) as TypeName[];
    for (const name of names) {
      const { size, lineHeight, weight, tracking } = typeScale[name];
      const step = `--text-${kebab(name)}`;
      expect(theme.get(step), name).toBe(`${size / 16}rem`);
      expect(theme.get(`${step}--line-height`), name).toBe(`${lineHeight / 16}rem`);
      // A step says its weight unless it is the regular one, which a parent may make heavier.
      expect(theme.get(`${step}--font-weight`), name).toBe(
        weight === 400 ? undefined : String(weight),
      );
      // And its tracking in em, as the tokens give it; a step without one may say `0em`.
      expect(theme.get(`${step}--letter-spacing`) ?? '0em', name).toBe(`${tracking}em`);
    }
  });

  it('draws the mono styles in Geist Mono and the label in capitals', () => {
    const utility = (name: string) => {
      const start = css.indexOf(`@utility ${name} {`);
      if (start < 0) throw new Error(`No utility for ${name}`);
      return css.slice(start, css.indexOf('}', start));
    };
    const names: TypeName[] = Object.keys(typeScale) as TypeName[];
    for (const name of names) {
      const { family, uppercase } = typeScale[name];
      if (family === 'mono') {
        expect(utility(`text-${kebab(name)}`), name).toMatch(/font-family: var\(--font-mono\);/u);
      } else {
        expect(css, name).not.toContain(`@utility text-${kebab(name)} {`);
      }
      if (uppercase) {
        expect(utility(`text-${kebab(name)}`), name).toMatch(/text-transform: uppercase;/u);
      }
    }
    expect(utility('text-meta')).not.toMatch(/text-transform/u);
  });

  it('declares the radii and the heights of §1.3', () => {
    const theme = block('@theme inline');
    // `rounded-sm` and `rounded-md` a chip and a field, `rounded-lg` a button, the larger ones a card.
    expect(theme.get('--radius-sm')).toBe(`${shape.tag}px`);
    expect(theme.get('--radius-md')).toBe(`${shape.field}px`);
    expect(theme.get('--radius-lg')).toBe(`${shape.button}px`);
    expect(theme.get('--radius-xl')).toBe(`${shape.card}px`);
    expect(theme.get('--radius-2xl')).toBe(`${shape.card}px`);
    const allowed = new Set(Object.values(radii).map((radius) => `${radius}px`));
    for (const [name, value] of theme) {
      if (name.startsWith('--radius-')) expect(allowed.has(value), name).toBe(true);
    }
    expect(theme.get('--spacing-control')).toBe(`${shape.webControlHeight / 16}rem`);
    expect(theme.get('--spacing-table-row')).toBe(`${shape.webTableRowHeight / 16}rem`);
  });

  it('has the two families of Fulmis and none of the previous values', () => {
    expect(css).toMatch(/--font-sans: var\(--font-geist\),/u);
    expect(css).toMatch(/--font-mono: var\(--font-geist-mono\),/u);
    expect(css).not.toMatch(/Hanken|Marcellus|Manrope|Georgia|oklch/iu);
    expect(css).not.toMatch(/box-shadow|backdrop-filter/u);
  });

  it('rings the focus in the ink (§1.3)', () => {
    const aliases = css.slice(css.indexOf('--background: var(--bg);'));
    expect(aliases).toMatch(/--ring: var\(--text\);/u);
  });
});

describe('theme cookie', () => {
  it('reads a valid choice and falls back to light (D26-E1)', () => {
    expect(themeChoiceFromCookie('dark')).toBe('dark');
    expect(themeChoiceFromCookie('light')).toBe('light');
    expect(themeChoiceFromCookie('system')).toBe('system');
    expect(themeChoiceFromCookie('purple')).toBe('light');
    expect(themeChoiceFromCookie(undefined)).toBe('light');
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
