import { describe, expect, it } from 'vitest';

import {
  findHygieneViolations,
  findStrictHygieneViolations,
  hygieneRules,
  strictHygieneRules,
  stripComments,
} from './hygiene';
import { palette, THEMES } from './tokens';

const rules = (source: string, platform: 'mobile' | 'web') =>
  findHygieneViolations(source, platform).map((v) => v.rule);

const strict = (source: string, platform: 'mobile' | 'web') =>
  findStrictHygieneViolations(source, platform).map((v) => v.rule);

describe('findHygieneViolations', () => {
  it('finds colours written by hand on both platforms', () => {
    expect(rules("const a = { color: '#0B1F3A' };", 'mobile')).toEqual(['hex-color']);
    expect(rules("const a = { color: '#fff' };", 'mobile')).toEqual(['hex-color']);
    expect(rules("backgroundColor: 'rgba(0, 0, 0, 0.4)'", 'mobile')).toEqual(['functional-color']);
    expect(rules('<div className="bg-[#f4f2ee]" />', 'web')).toEqual([
      'hex-color',
      'arbitrary-color',
    ]);
    expect(rules('<p className="text-slate-500 bg-white" />', 'web')).toEqual([
      'tailwind-palette',
      'tailwind-palette',
    ]);
  });

  it('leaves HTML entities, URL fragments and words alone', () => {
    expect(rules('<a href="/ayuda#faq">&#123;</a>', 'web')).toEqual([]);
    expect(rules("const id = 'Viaje #A-12';", 'mobile')).toEqual([]);
  });

  it('finds font sizes, radii and shadows written by hand in the app', () => {
    expect(rules('title: { fontSize: 22, borderRadius: 8 },', 'mobile')).toEqual([
      'font-size',
      'border-radius',
    ]);
    expect(rules('corner: { borderTopLeftRadius: 4 },', 'mobile')).toEqual(['border-radius']);
    expect(rules('card: { shadowOpacity: 0.2, elevation: 3 },', 'mobile')).toEqual([
      'shadow',
      'shadow',
    ]);
    // Values from the theme are fine.
    expect(
      rules(
        'a: { fontSize: type.body.fontSize, borderRadius: shape.card, ...type.label },',
        'mobile',
      ),
    ).toEqual([]);
  });

  it('finds Tailwind sizes, radii and shadows outside the scale on the web', () => {
    expect(rules('<p className="text-sm" />', 'web')).toEqual(['font-size']);
    expect(rules('<p className="text-[13px]" />', 'web')).toEqual(['font-size']);
    expect(rules('<div className="rounded-[10px]" />', 'web')).toEqual(['border-radius']);
    expect(rules('<div className="rounded-2xl shadow-md" />', 'web')).toEqual(['shadow']);
    expect(rules('<div className="border shadow" />', 'web')).toEqual(['shadow']);
    // The scale and the tokens are fine.
    expect(
      rules(
        '<p className="text-subhead text-text-dim text-red-text bg-red/14 rounded-full transition-[border-color,box-shadow]" />',
        'web',
      ),
    ).toEqual([]);
  });

  it('finds what is left of the old theme', () => {
    expect(rules('<h1 className="font-serif text-navy" />', 'web')).toEqual([
      'old-theme',
      'old-theme',
    ]);
    expect(rules("fontFamily: 'Georgia'", 'mobile')).toEqual(['old-theme']);
  });

  it('finds the family of the previous system, in any spelling', () => {
    expect(rules("import { Hanken_Grotesk } from 'next/font/google';", 'web')).toEqual([
      'old-font',
    ]);
    expect(rules("const font = 'HankenGrotesk_400Regular';", 'mobile')).toEqual(['old-font']);
    expect(rules('<p className="font-[family-name:var(--font-hanken)]" />', 'web')).toEqual([
      'old-font',
    ]);
    expect(rules("const font = 'Geist_400Regular';", 'mobile')).toEqual([]);
  });

  it('finds a shadow in a stylesheet too', () => {
    expect(rules('.card { box-shadow: 0 1px 2px var(--separator); }', 'web')).toEqual(['shadow']);
    expect(rules('.icon { filter: drop-shadow(0 1px 1px var(--text)); }', 'web')).toEqual([
      'shadow',
    ]);
    expect(rules('.title { text-shadow: none; }', 'web')).toEqual(['shadow']);
  });

  it('ignores comments, which may name what is gone', () => {
    expect(rules('// no shadow, not navy, never #000\nconst a = 1;', 'web')).toEqual([]);
    expect(rules('/* fontSize: 12 and\n   #0B1F3A */ const a = 1;', 'mobile')).toEqual([]);
    expect(rules('<div>{/* shadow-md */}</div>', 'web')).toEqual([]);
  });

  it('finds inline styles written by hand on the web too', () => {
    expect(
      rules(
        "<div style={{ fontSize: 13, borderRadius: '8px', boxShadow: '0 1px 2px black' }} />",
        'web',
      ),
    ).toEqual(['font-size', 'border-radius', 'shadow']);
    expect(rules('<div style={{ fontSize: size.body }} />', 'web')).toEqual([]);
  });

  it('tells comments from strings', () => {
    // A comment opener inside a string hides nothing.
    expect(
      rules("const marks = '/*'; const style = { color: '#fff' }; const end = '*/';", 'mobile'),
    ).toEqual(['hex-color']);
    // A line comment right after code is still a comment.
    expect(rules('work();// no navy', 'web')).toEqual([]);
    // A URL in a string is not a comment.
    expect(rules("const u = 'https://x.test/'; const c = '#fff';", 'web')).toEqual(['hex-color']);
  });

  it('says on which line it found each one', () => {
    const found = findHygieneViolations(
      'const a = 1;\n/* two\nlines */\nx: { fontSize: 9 }',
      'mobile',
    );
    expect(found).toEqual([
      expect.objectContaining({ rule: 'font-size', line: 4, match: 'fontSize: 9' }),
    ]);
  });
});

describe('findStrictHygieneViolations', () => {
  it('finds a shadow where the kit used to keep its two', () => {
    expect(strict('segment: { shadowColor: c.text, shadowOpacity: 0.08 },', 'mobile')).toEqual([
      'shadow',
      'shadow',
    ]);
    expect(strict('bar: { elevation: 8 },', 'mobile')).toEqual(['shadow']);
    expect(strict("selected ? 'bg-cell shadow-xs' : 'text-text-dim'", 'web')).toEqual(['shadow']);
    expect(strict('.bar { box-shadow: 0 8px 24px var(--separator); }', 'web')).toEqual(['shadow']);
    expect(strict("<div style={{ boxShadow: 'none' }} />", 'web')).toEqual(['shadow']);
  });

  it('finds the previous family', () => {
    expect(strict('--font-sans: var(--font-hanken), ui-sans-serif;', 'web')).toEqual(['old-font']);
    expect(
      strict(
        "import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold';",
        'mobile',
      ),
    ).toEqual(['old-font', 'old-font']);
  });

  it('finds the colour keys Fulmis retired, as keys, variables and classes', () => {
    expect(strict('own: { backgroundColor: colors.accentSoft },', 'mobile')).toEqual([
      'retired-token',
    ]);
    expect(strict('dot: { backgroundColor: colors.ok },', 'mobile')).toEqual(['retired-token']);
    expect(strict('const c = palette.light.textFaint;', 'mobile')).toEqual(['retired-token']);
    expect(strict('<p className="text-text-faint hover:bg-accent-soft/40" />', 'web')).toEqual([
      'retired-token',
      'retired-token',
    ]);
    expect(strict('<span className="text-ok-text border-glass-line bg-ok" />', 'web')).toEqual([
      'retired-token',
      'retired-token',
      'retired-token',
    ]);
    expect(strict('--color-highlight: var(--highlight);', 'web')).toEqual([
      'retired-token',
      'retired-token',
    ]);
    // What only looks like one is fine: a word, another key, a longer class.
    expect(strict("const ok = true; const label = 'okay';", 'mobile')).toEqual([]);
    expect(
      strict('<p className="text-text-dim bg-surface-high text-accent-text" />', 'web'),
    ).toEqual([]);
    expect(strict('colors.okay; colors.glassy;', 'mobile')).toEqual([]);
  });

  it('finds the hexes of the previous palette, in either case and with an alpha', () => {
    expect(strict('--bg: #f4f2ee;', 'web')).toEqual(['old-palette']);
    expect(strict("accent: '#1F5EFF',", 'mobile')).toEqual(['old-palette']);
    expect(strict("scrim: '#131214CC',", 'mobile')).toEqual(['old-palette']);
    expect(strict('--cell: #ffffff;', 'web')).toEqual(['old-palette']);
    // A longer hex that only starts like one is another colour.
    expect(strict("id: '#1F5EFF0',", 'mobile')).toEqual([]);
  });

  it('accepts every colour of Paper and Night, and the values a kit holds', () => {
    for (const theme of THEMES) {
      for (const value of Object.values(palette[theme])) {
        expect(strict(`--token: ${value.toLowerCase()};`, 'web')).toEqual([]);
        expect(strict(`token: '${value}',`, 'mobile')).toEqual([]);
      }
    }
    // A kit may write a size or a radius; what it may not is the above.
    expect(strict('title: { fontSize: 22, borderRadius: 8 },', 'mobile')).toEqual([]);
    expect(
      strict('<div className="rounded-md transition-[border-color,box-shadow]" />', 'web'),
    ).toEqual([]);
    expect(strict('--font-sans: var(--font-geist), ui-sans-serif, sans-serif;', 'web')).toEqual([]);
  });

  it('ignores comments, which may name what is gone', () => {
    expect(strict('/* no shadow-md, no Hanken, not #1F5EFF */ a { color: red; }', 'web')).toEqual(
      [],
    );
  });

  it('is part of the rules outside the kits too', () => {
    for (const platform of ['mobile', 'web'] as const) {
      const ids = new Set(hygieneRules[platform].map((rule) => rule.id));
      // The previous palette is covered there by `hex-color`: every hex is forbidden.
      for (const rule of strictHygieneRules[platform]) {
        expect(ids.has(rule.id === 'old-palette' ? 'hex-color' : rule.id)).toBe(true);
      }
    }
  });
});

describe('stripComments', () => {
  it('keeps URLs in strings and the line breaks of block comments', () => {
    expect(stripComments("const u = 'https://example.com/#top';")).toBe(
      "const u = 'https://example.com/#top';",
    );
    expect(stripComments('a /* b\nc */ d').split('\n')).toHaveLength(2);
  });
});
