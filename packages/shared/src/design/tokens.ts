/**
 * Design tokens of "Fulmis" (D26-E2, docs/plan-fulmis.md §1): the single
 * source of the colours, type scale, spacing and radii of the web and the
 * app. Pure data, no React: the app builds its theme on it
 * (apps/mobile/src/theme.tsx) and the web mirrors it as CSS variables
 * (apps/web/src/app/globals.css, checked by a test).
 */

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The colours of one theme (§1.1): Paper is the light one, Night the dark one.
 * The `brand*` colours are Night in both, for the surfaces that never change
 * with the theme. The keys under "Temporary aliases" belong to the previous
 * system: screens still read them, V2 and V6 move those screens to the keys
 * above them and V9 deletes the aliases.
 */
export interface Palette {
  /** The page. */
  readonly bg: string;
  /** Cards, tables and fields. */
  readonly cell: string;
  /** Hairlines between surfaces (decorative: below 3:1 on purpose). */
  readonly separator: string;
  /** The selected row, the neutral chip, highlighted blocks. */
  readonly surfaceHigh: string;
  /** The border of fields and controls (at least 3:1 on `bg` and `cell`). */
  readonly control: string;
  readonly text: string;
  /** Secondary text and placeholders. */
  readonly textDim: string;
  /** The accent: the fill of the primary button, selection and counters. Never text on Paper (2.4:1). */
  readonly accent: string;
  /** Ink on the accent. */
  readonly accentInk: string;
  /** The accent as text and links. Not on `surfaceHigh` (4.25:1 on Paper). */
  readonly accentText: string;
  /** "In progress" as text and icons. */
  readonly info: string;
  /** The fill of an "in progress" pill, and its ink. */
  readonly infoFill: string;
  readonly infoInk: string;
  /** The fill of "pending", and its ink. */
  readonly amber: string;
  readonly amberInk: string;
  /** A warning as text. */
  readonly amberText: string;
  /** The fill of error, overdue and destructive, and its ink. Not a text colour. */
  readonly red: string;
  readonly redInk: string;
  /** An error as text. */
  readonly redText: string;

  /** Brand surfaces (the web's sidebar, the access panel, "Tu siguiente paso"): Night in both themes. */
  readonly brandBg: string;
  readonly brandText: string;
  readonly brandTextDim: string;
  readonly brandLine: string;
  /** The selected element of a brand surface. */
  readonly brandSelected: string;
  /** Its text, and the fill of the button of a brand surface. */
  readonly brandAccent: string;

  // Temporary aliases (V9 deletes them).
  /** Alias of `textDim`. */
  readonly textFaint: string;
  /** A ground on which `accentText` is AA: the page on Paper, `surfaceHigh` on Night. */
  readonly accentSoft: string;
  /** Aliases of `text`: Fulmis has no green, "done" is a quiet state. */
  readonly ok: string;
  readonly okText: string;
  /** Alias of `cell`. */
  readonly highlight: string;
  /** Aliases of `cell` and `separator`: bars are solid, nothing is glass. */
  readonly glass: string;
  readonly glassLine: string;
}

/** Night, for the surfaces of the brand: the same in both themes. */
const brand = {
  brandBg: '#121415',
  brandText: '#F4EFE6',
  brandTextDim: '#A29A90',
  brandLine: '#2C2F32',
  brandSelected: '#1C1E20',
  brandAccent: '#E5630B',
} as const;

export const palette: Readonly<Record<Theme, Palette>> = Object.freeze({
  // Paper.
  light: Object.freeze({
    bg: '#E7D5BA',
    cell: '#F0E8DA',
    separator: '#CDB894',
    surfaceHigh: '#DCC7A5',
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
    ...brand,
    textFaint: '#5C544B',
    accentSoft: '#E7D5BA',
    ok: '#121415',
    okText: '#121415',
    highlight: '#F0E8DA',
    glass: '#F0E8DA',
    glassLine: '#CDB894',
  }),
  // Night.
  dark: Object.freeze({
    bg: '#121415',
    cell: '#1C1E20',
    separator: '#2C2F32',
    surfaceHigh: '#261D18',
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
    // Not a Fulmis colour: derived, so that an error reads as text on Night.
    redText: '#F2917F',
    ...brand,
    textFaint: '#A29A90',
    accentSoft: '#261D18',
    ok: '#F4EFE6',
    okText: '#F4EFE6',
    highlight: '#1C1E20',
    glass: '#1C1E20',
    glassLine: '#2C2F32',
  }),
});

/**
 * The status tones of a pill as the screens still ask for them: the base tone
 * at 14 % under its `*Text` tone. V2 and V6 replace them with the six filled
 * tones of §1.1; `ok` is one of the temporary aliases.
 */
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

/**
 * The ground and the text of a pill of `tone`. The accent one sits on the
 * `accentSoft` token and never on a 14 % mix of the accent: on Night the
 * orange on its own mix is 4.1:1.
 */
export function toneColors(theme: Theme, tone: StatusTone): { bg: string; fg: string } {
  const colors = palette[theme];
  return {
    bg: tone === 'accent' ? colors.accentSoft : mixColors(colors[tone], colors.cell, SOFT_ALPHA),
    fg: colors[STATUS_TONE_TEXT[tone]],
  };
}

/** Font weights of Geist (§1.2). Geist Mono is used in 500 and 700 only. */
export type FontWeight = 400 | 500 | 600 | 700 | 800 | 900;

/** The two families (§1.2): Geist for text and titles, Geist Mono for labels and metadata. */
export type TypeFamily = 'sans' | 'mono';

export interface TypeStyle {
  readonly family: TypeFamily;
  /** Size in px (points in the app). */
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: FontWeight;
  /** Letter spacing in em, as §1.2 gives it (the web uses it as is). */
  readonly tracking: number;
  /** The same in px, for the app: `size × tracking`. */
  readonly letterSpacing: number;
  /** Drawn in capitals (the text itself does not change). */
  readonly uppercase: boolean;
}

function typeStyle(
  family: TypeFamily,
  size: number,
  lineHeight: number,
  weight: FontWeight,
  tracking = 0,
  uppercase = false,
): TypeStyle {
  const letterSpacing = Math.round(size * tracking * 100) / 100;
  return { family, size, lineHeight, weight, tracking, letterSpacing, uppercase };
}

/** The tracking of every title (§1.2). */
const TITLE_TRACKING = -0.035;

/**
 * Type scale (§1.2). Titles in 800 with tight tracking, body in 400. `label`
 * is for short labels (up to three words: a table heading, the name of a
 * figure, a section title), never for sentences nor for what the person
 * types; `meta` for folios, dates, times and plates; `numeral` for the main
 * figure of an indicator or of an amount.
 */
export const typeScale = Object.freeze({
  largeTitle: typeStyle('sans', 34, 41, 800, TITLE_TRACKING),
  title1: typeStyle('sans', 28, 34, 800, TITLE_TRACKING),
  title2: typeStyle('sans', 22, 28, 800, TITLE_TRACKING),
  title3: typeStyle('sans', 20, 25, 800, TITLE_TRACKING),
  headline: typeStyle('sans', 17, 22, 600),
  body: typeStyle('sans', 17, 22, 400),
  callout: typeStyle('sans', 16, 21, 400),
  subhead: typeStyle('sans', 15, 20, 400),
  footnote: typeStyle('sans', 13, 18, 400),
  caption: typeStyle('sans', 12, 16, 400),
  label: typeStyle('mono', 11, 16, 700, 0.14, true),
  meta: typeStyle('mono', 12, 16, 500, 0.08),
  numeral: typeStyle('sans', 34, 38, 900, -0.04),
} satisfies Record<string, TypeStyle>);

export type TypeName = keyof typeof typeScale;

/** The families, by name, for the web (`next/font/google`) and the docs. */
export const fontFamily = 'Geist';
export const monoFontFamily = 'Geist Mono';

/** Spacing steps (§1.3): the 4 pt scale. */
export const spacing = Object.freeze({ xs: 4, sm: 8, md: 16, lg: 24, xl: 40 });

/**
 * Radii (§1.3): 0 for cards, tables, sheets, the sidebar and dialogs; 3 for
 * fields, chips, checkboxes and navigation items; 8 for buttons; 999 for
 * status pills, avatars and switches.
 */
export const radii = Object.freeze({ none: 0, sm: 3, md: 8, pill: 999 });

/** Sizes of the shapes the components share (§1.3). */
export const shape = Object.freeze({
  field: radii.sm,
  tag: radii.sm,
  button: radii.md,
  card: radii.none,
  photo: radii.none,
  sheet: radii.none,
  pill: radii.pill,
  /** Minimum height of a cell. */
  cellMinHeight: 50,
  /** Control heights in the app: a button, the operator's primary and the small button. */
  buttonHeight: 48,
  buttonHeightPrimary: 56,
  buttonHeightSmall: 40,
  /** Field height in the app. */
  fieldHeight: 48,
  /** Heights on the web (`h-control`, `h-table-row`): a control and a table row. */
  webControlHeight: 40,
  webTableRowHeight: 44,
  /** Left inset of the separator between cells. */
  separatorInset: 16,
  /** The smallest touch target (Apple HIG): smaller controls reach it with a hit slop. */
  minTouch: 44,
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
