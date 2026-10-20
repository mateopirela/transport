/**
 * Design tokens of "Transport · Nativo" (D26, docs/plan-rediseno.md §1): the
 * single source of the colours, type scale, spacing and radii of the web and
 * the app. Pure data, no React: the app builds its theme on it
 * (apps/mobile/src/theme.tsx) and the web mirrors it as CSS variables
 * (apps/web/src/app/globals.css, checked by a test).
 */

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** The colours of one theme. Names follow the ShowBe "C · Nativo" system. */
export interface Palette {
  /** The page. */
  readonly bg: string;
  /** Cells, cards, groups and fields. */
  readonly cell: string;
  /** Hairlines. */
  readonly separator: string;
  /** A step above the page: icon tiles, disabled controls, own chat bubbles. */
  readonly surfaceHigh: string;
  readonly text: string;
  readonly textDim: string;
  /** Tertiary text and placeholders. */
  readonly textFaint: string;
  /** The accent: the primary button, selection and badges. */
  readonly accent: string;
  /** The accent as text on the page. */
  readonly accentText: string;
  /** Ink on the accent. */
  readonly accentInk: string;
  /** The accent at 14 %: pills and selected rows. */
  readonly accentSoft: string;
  /** Success: fills, icons and text of 20 px or more. */
  readonly ok: string;
  /** Success as small text. */
  readonly okText: string;
  /** Pending or due soon: fills and icons. */
  readonly amber: string;
  readonly amberText: string;
  /** Error, overdue, destructive: fills, icons and the destructive button. */
  readonly red: string;
  readonly redText: string;
  /** Notice after something went well. */
  readonly highlight: string;
  /** The floating bar and the bottom bar (with blur). */
  readonly glass: string;
  readonly glassLine: string;
}

export const palette: Readonly<Record<Theme, Palette>> = Object.freeze({
  light: Object.freeze({
    bg: '#F4F2EE',
    cell: '#FFFFFF',
    separator: '#E7E2DA',
    surfaceHigh: '#ECE8E2',
    text: '#1A1917',
    textDim: '#6E6963',
    textFaint: '#736D67',
    accent: '#1F5EFF',
    accentText: '#0F47D4',
    accentInk: '#FFFFFF',
    accentSoft: '#E4ECFF',
    ok: '#2B8A57',
    okText: '#1F6B43',
    amber: '#B8781A',
    amberText: '#8A5A12',
    red: '#C0392B',
    redText: '#A52E22',
    highlight: '#F4E9DA',
    glass: 'rgba(255,255,255,0.74)',
    glassLine: 'rgba(0,0,0,0.06)',
  }),
  dark: Object.freeze({
    bg: '#131214',
    cell: '#1D1C1F',
    separator: '#2D2B30',
    surfaceHigh: '#2A282C',
    text: '#F2F0EE',
    textDim: '#A5A09B',
    textFaint: '#8F8A84',
    accent: '#5C8CFF',
    accentText: '#8AB0FF',
    accentInk: '#0B1430',
    accentSoft: '#1C2742',
    ok: '#5FCF95',
    okText: '#5FCF95',
    amber: '#E9B45A',
    amberText: '#E9B45A',
    red: '#FF8A7E',
    redText: '#FF8A7E',
    highlight: '#3E3328',
    glass: 'rgba(29,28,31,0.82)',
    glassLine: 'rgba(255,255,255,0.08)',
  }),
});

/** The status tones of a pill: the base tone at 14 % under its `*Text` tone. */
export const STATUS_TONES = ['accent', 'ok', 'amber', 'red'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

const STATUS_TONE_TEXT: Record<StatusTone, keyof Palette> = {
  accent: 'accentText',
  ok: 'okText',
  amber: 'amberText',
  red: 'redText',
};

/** How much of the base tone a pill's ground has over `cell`. */
export const SOFT_ALPHA = 0.14;

/** The ground and the text of a pill of `tone` (§1.1). */
export function toneColors(theme: Theme, tone: StatusTone): { bg: string; fg: string } {
  const colors = palette[theme];
  return {
    bg: tone === 'accent' ? colors.accentSoft : mixColors(colors[tone], colors.cell, SOFT_ALPHA),
    fg: colors[STATUS_TONE_TEXT[tone]],
  };
}

/** Font weights of Hanken Grotesk, the only family (§1.2). */
export type FontWeight = 400 | 500 | 600 | 700;

export interface TypeStyle {
  /** Size in px (points in the app). */
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: FontWeight;
  readonly letterSpacing: number;
}

/** iOS-like type scale (§1.2). */
export const typeScale = Object.freeze({
  largeTitle: { size: 34, lineHeight: 41, weight: 700, letterSpacing: -0.75 },
  title1: { size: 28, lineHeight: 34, weight: 700, letterSpacing: -0.6 },
  title2: { size: 22, lineHeight: 28, weight: 700, letterSpacing: -0.3 },
  title3: { size: 20, lineHeight: 25, weight: 600, letterSpacing: -0.24 },
  headline: { size: 17, lineHeight: 22, weight: 600, letterSpacing: 0 },
  body: { size: 17, lineHeight: 22, weight: 400, letterSpacing: 0 },
  callout: { size: 16, lineHeight: 21, weight: 400, letterSpacing: 0 },
  subhead: { size: 15, lineHeight: 20, weight: 400, letterSpacing: 0 },
  footnote: { size: 13, lineHeight: 18, weight: 400, letterSpacing: 0 },
  caption: { size: 12, lineHeight: 16, weight: 400, letterSpacing: 0 },
  label: { size: 13, lineHeight: 18, weight: 600, letterSpacing: 0 },
} satisfies Record<string, TypeStyle>);

export type TypeName = keyof typeof typeScale;

/** The family, by name, for the web (`next/font/google`) and the docs. */
export const fontFamily = 'Hanken Grotesk';

/** Spacing steps (§1.3). */
export const spacing = Object.freeze({ xs: 4, sm: 8, md: 16, lg: 24, xl: 40 });

/** Radii (§1.3): small tag 6, field 12, cell/group/card/photo 16, sheet top 28, pills 999. */
export const radii = Object.freeze({ sm: 6, md: 12, lg: 16, sheet: 28, pill: 999 });

/** Sizes of the shapes the components share (§1.3). */
export const shape = Object.freeze({
  field: radii.md,
  card: radii.lg,
  photo: radii.lg,
  sheet: radii.sheet,
  tag: radii.sm,
  pill: radii.pill,
  /** Minimum height of a cell. */
  cellMinHeight: 50,
  /** Button heights in the app: regular and small. */
  buttonHeight: 52,
  buttonHeightSmall: 40,
  /** Field height in the app. */
  fieldHeight: 48,
  /** Left inset of the separator between cells. */
  separatorInset: 16,
});

/** sRGB channels (0–255) of `#RRGGBB`. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(channels: readonly number[]): string {
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

/** `top` at `alpha` over the opaque `under`, as `#RRGGBB`. */
export function mixColors(top: string, under: string, alpha: number): string {
  const a = hexToRgb(top);
  const b = hexToRgb(under);
  return toHex(a.map((channel, i) => channel * alpha + (b[i] ?? 0) * (1 - alpha)));
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
