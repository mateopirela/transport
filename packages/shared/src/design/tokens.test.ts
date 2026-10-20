import { describe, expect, it } from 'vitest';

import { parseThemeChoice, resolveTheme, THEME_CHOICES } from './theme';
import {
  contrastRatio,
  hexToRgb,
  mixColors,
  palette,
  radii,
  shape,
  STATUS_TONES,
  THEMES,
  toneColors,
  typeScale,
  type Palette,
} from './tokens';

const AA = 4.5;

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
    // Symmetric.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#777777'));
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('rejects anything but #RRGGBB', () => {
    expect(() => hexToRgb('rgba(0,0,0,1)')).toThrow();
    expect(() => hexToRgb('#FFF')).toThrow();
    expect(hexToRgb('#1F5EFF')).toEqual([31, 94, 255]);
  });
});

describe('mixColors', () => {
  it('lays a colour at an alpha over another', () => {
    expect(mixColors('#000000', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(mixColors('#000000', '#FFFFFF', 1)).toBe('#000000');
    expect(mixColors('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});

describe.each(THEMES)('palette (%s)', (theme) => {
  const c: Palette = palette[theme];

  // Every text/ground pair the system uses (§1.1): normal text needs AA.
  const pairs: [string, keyof Palette, keyof Palette][] = [
    ['text on cell', 'text', 'cell'],
    ['text on bg', 'text', 'bg'],
    ['textDim on cell', 'textDim', 'cell'],
    ['textDim on bg', 'textDim', 'bg'],
    ['textFaint on cell', 'textFaint', 'cell'],
    ['textFaint on bg', 'textFaint', 'bg'],
    ['accentInk on accent', 'accentInk', 'accent'],
    ['accentText on bg', 'accentText', 'bg'],
    ['accentText on cell', 'accentText', 'cell'],
    ['accentText on accentSoft', 'accentText', 'accentSoft'],
    ['okText on cell', 'okText', 'cell'],
    ['amberText on cell', 'amberText', 'cell'],
    ['redText on cell', 'redText', 'cell'],
    ['okText on bg', 'okText', 'bg'],
    ['amberText on bg', 'amberText', 'bg'],
    ['redText on bg', 'redText', 'bg'],
    ['text on highlight', 'text', 'highlight'],
    ['text on surfaceHigh', 'text', 'surfaceHigh'],
  ];

  it.each(pairs)('%s is AA', (_, fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA);
  });

  it.each(STATUS_TONES)('the %s pill text is AA on its 14 %% ground', (tone) => {
    const { fg, bg } = toneColors(theme, tone);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
    // The 14 % mix too for the accent, whose soft ground is a token.
    if (tone === 'accent') {
      expect(contrastRatio(fg, mixColors(c.accent, c.cell, 0.14))).toBeGreaterThanOrEqual(AA);
    }
  });

  it('never draws on pure black or pure white pages', () => {
    expect(c.bg).not.toBe('#000000');
    expect(c.bg).not.toBe('#FFFFFF');
  });

  it('keeps every opaque colour as #RRGGBB', () => {
    for (const [name, value] of Object.entries(c)) {
      if (name.startsWith('glass')) expect(value).toMatch(/^rgba\(/);
      else expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('both themes', () => {
  it('define the same colour names', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });
});

describe('type scale and shape', () => {
  it('follows §1.2', () => {
    expect(typeScale.largeTitle).toEqual({
      size: 34,
      lineHeight: 41,
      weight: 700,
      letterSpacing: -0.75,
    });
    expect(typeScale.body.size).toBe(17);
    expect(typeScale.label.weight).toBe(600);
    for (const style of Object.values(typeScale)) {
      expect(style.lineHeight).toBeGreaterThan(style.size);
    }
  });

  it('follows §1.3', () => {
    expect(radii).toMatchObject({ sm: 6, md: 12, lg: 16, sheet: 28, pill: 999 });
    expect(shape).toMatchObject({ field: 12, card: 16, cellMinHeight: 50, buttonHeight: 52 });
  });
});

describe('resolveTheme', () => {
  it('uses the choice when it names a theme', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  it("follows the device's scheme otherwise, light when unknown", () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', null)).toBe('light');
    expect(resolveTheme(null, 'dark')).toBe('dark');
    expect(resolveTheme(undefined, 'unspecified')).toBe('light');
  });
});

describe('parseThemeChoice', () => {
  it('accepts the three choices only', () => {
    for (const choice of THEME_CHOICES) expect(parseThemeChoice(choice)).toBe(choice);
    expect(parseThemeChoice('auto')).toBeNull();
    expect(parseThemeChoice(undefined)).toBeNull();
    expect(parseThemeChoice(1)).toBeNull();
  });
});
