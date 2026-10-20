import { describe, expect, it } from 'vitest';

import { findHygieneViolations, stripComments } from './hygiene';

const rules = (source: string, platform: 'mobile' | 'web') =>
  findHygieneViolations(source, platform).map((v) => v.rule);

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
        'a: { fontSize: type.body.fontSize, borderRadius: shape.card, ...shadows.tabBar },',
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

describe('stripComments', () => {
  it('keeps URLs in strings and the line breaks of block comments', () => {
    expect(stripComments("const u = 'https://example.com/#top';")).toBe(
      "const u = 'https://example.com/#top';",
    );
    expect(stripComments('a /* b\nc */ d').split('\n')).toHaveLength(2);
  });
});
