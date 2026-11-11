import { describe, expect, it } from 'vitest';

import { parseThemeChoice, resolveTheme, THEME_CHOICES } from './theme';
import {
  contrastRatio,
  fontFamily,
  hexToRgb,
  mixColors,
  monoFontFamily,
  palette,
  radii,
  shape,
  SOFT_ALPHA,
  spacing,
  STATUS_TONES,
  THEMES,
  toneColors,
  typeScale,
  type Palette,
} from './tokens';

/** Normal text (WCAG 2.1 AA). */
const AA = 4.5;
/** The border of a control and the focus outline (WCAG 2.1, 1.4.11). */
const AA_BORDER = 3;

type Pair = [name: string, fg: keyof Palette, bg: keyof Palette];

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
    expect(hexToRgb('#E5630B')).toEqual([229, 99, 11]);
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

  // The table of measured contrasts of §1.1: every text/ground pair is AA.
  const text: Pair[] = [
    ['text on bg', 'text', 'bg'],
    ['text on cell', 'text', 'cell'],
    ['text on surfaceHigh', 'text', 'surfaceHigh'],
    ['textDim on bg', 'textDim', 'bg'],
    ['textDim on cell', 'textDim', 'cell'],
    ['textDim on surfaceHigh', 'textDim', 'surfaceHigh'],
    ['accentText on bg', 'accentText', 'bg'],
    ['accentText on cell', 'accentText', 'cell'],
    ['accentInk on accent', 'accentInk', 'accent'],
    ['info on bg', 'info', 'bg'],
    ['info on cell', 'info', 'cell'],
    ['infoInk on infoFill', 'infoInk', 'infoFill'],
    ['redText on bg', 'redText', 'bg'],
    ['redText on cell', 'redText', 'cell'],
    ['redInk on red', 'redInk', 'red'],
    ['amberInk on amber', 'amberInk', 'amber'],
    ['amberText on bg', 'amberText', 'bg'],
    ['amberText on cell', 'amberText', 'cell'],
  ];

  it.each(text)('%s is AA', (_, fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA);
  });

  // The border of fields and controls, and the focus outline (which is `text`).
  const borders: Pair[] = [
    ['control on bg', 'control', 'bg'],
    ['control on cell', 'control', 'cell'],
    ['the focus outline on bg', 'text', 'bg'],
    ['the focus outline on cell', 'text', 'cell'],
    ['the focus outline on surfaceHigh', 'text', 'surfaceHigh'],
  ];

  it.each(borders)('%s is at least 3:1', (_, fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA_BORDER);
  });

  // The temporary aliases (§1.1), for as long as a screen reads them.
  const aliases: Pair[] = [
    ['textFaint on bg', 'textFaint', 'bg'],
    ['textFaint on cell', 'textFaint', 'cell'],
    ['accentText on accentSoft', 'accentText', 'accentSoft'],
    ['okText on bg', 'okText', 'bg'],
    ['okText on cell', 'okText', 'cell'],
    ['text on highlight', 'text', 'highlight'],
    ['amberText on highlight', 'amberText', 'highlight'],
    ['text on glass', 'text', 'glass'],
    ['textDim on glass', 'textDim', 'glass'],
    ['accentText on glass', 'accentText', 'glass'],
  ];

  it.each(aliases)('%s is AA (alias)', (_, fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA);
  });

  it('keeps each alias on the value of the key it stands for', () => {
    expect(c.textFaint).toBe(c.textDim);
    expect(c.ok).toBe(c.text);
    expect(c.okText).toBe(c.text);
    expect(c.highlight).toBe(c.cell);
    expect(c.glass).toBe(c.cell);
    expect(c.glassLine).toBe(c.separator);
    // Not `surfaceHigh` on Paper, where `accentText` is 4.25:1.
    expect(c.accentSoft).toBe(theme === 'light' ? c.bg : c.surfaceHigh);
  });

  // The surfaces of the brand: Night in both themes.
  const brand: Pair[] = [
    ['brandText on brandBg', 'brandText', 'brandBg'],
    ['brandText on brandSelected', 'brandText', 'brandSelected'],
    ['brandTextDim on brandBg', 'brandTextDim', 'brandBg'],
    ['brandTextDim on brandSelected', 'brandTextDim', 'brandSelected'],
    ['brandAccent on brandBg', 'brandAccent', 'brandBg'],
    ['brandAccent on brandSelected', 'brandAccent', 'brandSelected'],
    ['accentInk on brandAccent', 'accentInk', 'brandAccent'],
  ];

  it.each(brand)('%s is AA (brand)', (_, fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA);
  });

  it.each(STATUS_TONES)('the %s pill text is AA on its ground', (tone) => {
    const { fg, bg } = toneColors(theme, tone);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('puts the accent pill on the accentSoft token, the others on a 14 % mix over the cell', () => {
    // Never a 14 % mix of the accent: the orange of Night on it is 4.1:1.
    expect(toneColors(theme, 'accent').bg).toBe(c.accentSoft);
    for (const tone of ['ok', 'amber', 'red'] as const) {
      expect(toneColors(theme, tone).bg).toBe(mixColors(c[tone], c.cell, SOFT_ALPHA));
    }
  });

  it('keeps an error readable on its soft ground', () => {
    // The destructive notice of the app: `redText` on `red` at 14 % over the cell.
    expect(contrastRatio(c.redText, mixColors(c.red, c.cell, SOFT_ALPHA))).toBeGreaterThanOrEqual(
      AA,
    );
  });

  it('never draws on pure black or pure white pages', () => {
    expect(c.bg).not.toBe('#000000');
    expect(c.bg).not.toBe('#FFFFFF');
  });

  it('keeps every colour opaque, as #RRGGBB: nothing is glass', () => {
    for (const value of Object.values(c)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('has no green: "done" is the ink', () => {
    for (const value of Object.values(c)) {
      const [r, g, b] = hexToRgb(value);
      expect(g > r && g > b).toBe(false);
    }
  });
});

describe('both themes', () => {
  it('define the same colour names', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });

  it('share the surfaces of the brand, which are Night', () => {
    const brandKeys = (Object.keys(palette.light) as (keyof Palette)[]).filter((key) =>
      key.startsWith('brand'),
    );
    expect(brandKeys).toHaveLength(6);
    for (const key of brandKeys) expect(palette.light[key]).toBe(palette.dark[key]);
    expect(palette.light.brandBg).toBe(palette.dark.bg);
    expect(palette.light.brandText).toBe(palette.dark.text);
    expect(palette.light.brandTextDim).toBe(palette.dark.textDim);
    expect(palette.light.brandLine).toBe(palette.dark.separator);
    expect(palette.light.brandSelected).toBe(palette.dark.cell);
    expect(palette.light.brandAccent).toBe(palette.dark.accent);
  });

  it('follow §1.1', () => {
    expect(palette.light).toMatchObject({
      bg: '#E7D5BA',
      cell: '#F0E8DA',
      surfaceHigh: '#DCC7A5',
      separator: '#CDB894',
      control: '#7A6440',
      text: '#121415',
      textDim: '#5C544B',
      accent: '#E5630B',
      accentInk: '#121415',
      accentText: '#993C09',
      info: '#0B5F8C',
      infoFill: '#0B5F8C',
      infoInk: '#F4EFE6',
      amber: '#FCD090',
      amberInk: '#121415',
      amberText: '#993C09',
      red: '#61150D',
      redInk: '#F4EFE6',
      redText: '#61150D',
    });
    expect(palette.dark).toMatchObject({
      bg: '#121415',
      cell: '#1C1E20',
      surfaceHigh: '#261D18',
      separator: '#2C2F32',
      control: '#6E7377',
      text: '#F4EFE6',
      textDim: '#A29A90',
      accent: '#E5630B',
      accentInk: '#121415',
      accentText: '#E5630B',
      info: '#35A9DE',
      infoFill: '#065AA5',
      infoInk: '#F4EFE6',
      amber: '#FCD090',
      amberInk: '#121415',
      amberText: '#FCD090',
      red: '#61150D',
      redInk: '#F4EFE6',
      redText: '#F2917F',
    });
  });
});

describe('type scale and shape', () => {
  it('follows §1.2', () => {
    expect(fontFamily).toBe('Geist');
    expect(monoFontFamily).toBe('Geist Mono');
    expect(typeScale.largeTitle).toEqual({
      family: 'sans',
      size: 34,
      lineHeight: 41,
      weight: 800,
      tracking: -0.035,
      letterSpacing: -1.19,
      uppercase: false,
    });
    for (const title of ['largeTitle', 'title1', 'title2', 'title3'] as const) {
      expect(typeScale[title]).toMatchObject({ family: 'sans', weight: 800, tracking: -0.035 });
    }
    expect(typeScale.body).toMatchObject({ family: 'sans', size: 17, weight: 400, tracking: 0 });
    expect(typeScale.label).toEqual({
      family: 'mono',
      size: 11,
      lineHeight: 16,
      weight: 700,
      tracking: 0.14,
      letterSpacing: 1.54,
      uppercase: true,
    });
    expect(typeScale.meta).toMatchObject({ family: 'mono', size: 12, weight: 500, tracking: 0.08 });
    expect(typeScale.numeral).toMatchObject({ family: 'sans', weight: 900, tracking: -0.04 });
  });

  it('keeps every style readable and within the weights of its family', () => {
    for (const style of Object.values(typeScale)) {
      expect(style.lineHeight).toBeGreaterThan(style.size);
      expect(style.letterSpacing).toBeCloseTo(style.size * style.tracking, 2);
      // Geist Mono is loaded in 500 and 700 only.
      if (style.family === 'mono') expect([500, 700]).toContain(style.weight);
      // Only the short label is drawn in capitals.
      expect(style.uppercase).toBe(style === typeScale.label);
    }
  });

  it('follows §1.3', () => {
    expect(radii).toEqual({ none: 0, sm: 3, md: 8, pill: 999 });
    expect(shape).toMatchObject({
      field: 3,
      tag: 3,
      button: 8,
      card: 0,
      photo: 0,
      sheet: 0,
      pill: 999,
      cellMinHeight: 50,
      buttonHeight: 48,
      buttonHeightPrimary: 56,
      fieldHeight: 48,
      webControlHeight: 40,
      webTableRowHeight: 44,
      minTouch: 44,
    });
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 40 });
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
