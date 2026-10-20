/**
 * The hygiene check of "Transport · Nativo" (docs/plan-rediseno.md §0.3, U9):
 * outside the kits, a screen never writes a colour, a font size, a radius or a
 * shadow by hand, and nothing of the old theme (the deck's navy, the serif
 * titles) is left. Pure: it reads a file's text and says what it found; each
 * app's test walks its own `src` with it.
 */

export type HygienePlatform = 'mobile' | 'web';

export interface HygieneRule {
  readonly id: string;
  /** What to use instead, for the failure message. */
  readonly hint: string;
  readonly pattern: RegExp;
}

export interface HygieneViolation {
  readonly rule: string;
  readonly hint: string;
  /** 1-based. */
  readonly line: number;
  readonly match: string;
}

const COMMON: readonly HygieneRule[] = [
  {
    id: 'hex-color',
    hint: 'a colour of the theme (useTheme() or a token class)',
    // Not an HTML entity (&#123;) nor a URL fragment (/#top).
    pattern: /(?<![\w&/#])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/giu,
  },
  {
    id: 'functional-color',
    hint: 'a colour of the theme (useTheme() or a token class)',
    pattern: /\b(?:rgba?|hsla?|oklch)\(/giu,
  },
  {
    id: 'old-theme',
    hint: 'the old theme is gone: the ink is `text`, the one family is Hanken Grotesk',
    pattern: /\b(?:navy|Georgia|serif|Marcellus|Manrope)\b/gu,
  },
];

const MOBILE: readonly HygieneRule[] = [
  {
    id: 'font-size',
    hint: 'a style of the type scale (useTheme().type)',
    pattern: /\bfontSize\s*:\s*\d+(?:\.\d+)?/gu,
  },
  {
    id: 'border-radius',
    hint: 'a radius of `shape` or `radii`',
    pattern: /\bborder(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*\d+(?:\.\d+)?/gu,
  },
  {
    id: 'shadow',
    hint: 'hairlines instead of shadows (§1.3); the kit owns the only two',
    pattern: /\b(?:shadow(?:Color|Opacity|Radius|Offset)|boxShadow|elevation)\s*:/gu,
  },
];

const PALETTE_HUES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITIES =
  'text|bg|border|ring|outline|fill|stroke|from|via|to|divide|decoration|placeholder|caret|accent';

const WEB: readonly HygieneRule[] = [
  {
    id: 'tailwind-palette',
    hint: 'a token class (text-text-dim, bg-cell, text-red-text…)',
    pattern: new RegExp(
      `(?<![\\w-])(?:${COLOR_UTILITIES})-(?:(?:${PALETTE_HUES})-\\d{2,3}|white|black)(?![\\w-])`,
      'gu',
    ),
  },
  {
    id: 'arbitrary-color',
    hint: 'a token class (text-text-dim, bg-cell, text-red-text…)',
    pattern: new RegExp(`(?<![\\w-])(?:${COLOR_UTILITIES})-\\[(?:#|rgb|hsl|oklch|color:)`, 'gu'),
  },
  {
    id: 'font-size',
    hint: 'a step of the type scale (text-body, text-subhead, text-footnote…)',
    pattern: /(?<![\w-])text-(?:xs|sm|base|lg|[2-9]?xl|\[\d[^\]]*\])(?![\w-])/gu,
  },
  {
    id: 'border-radius',
    hint: 'rounded-md (12), rounded-2xl (16), rounded-sm (6) or rounded-full',
    pattern: /(?<![\w-])rounded(?:-[trblse]{1,2})?-\[/gu,
  },
  {
    id: 'shadow',
    hint: 'hairlines instead of shadows (§1.3); the kit owns the only two',
    pattern:
      /(?<![\w-])(?:shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner|\[[^\]]*\]))?|drop-shadow(?:-\w+)?)(?=["'`\s}])/gu,
  },
];

/** The rules of each platform: the common ones and its own. */
export const hygieneRules: Readonly<Record<HygienePlatform, readonly HygieneRule[]>> =
  Object.freeze({
    mobile: [...COMMON, ...MOBILE],
    web: [...COMMON, ...WEB],
  });

/**
 * Blanks out comments (keeping the line breaks, so lines still count right):
 * a comment may name what it no longer does ("no shadow", "not navy").
 * A `//` counts only at the start of a line or after a space, so URLs in
 * strings stay.
 */
export function stripComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/gu, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, blank)
    .replace(
      /(^|\s)\/\/[^\n]*/gmu,
      (match, lead: string) => lead + blank(match.slice(lead.length)),
    );
}

/** What a file's text breaks of the hygiene rules of its platform, line by line. */
export function findHygieneViolations(
  source: string,
  platform: HygienePlatform,
): HygieneViolation[] {
  const lines = stripComments(source).split('\n');
  const found: HygieneViolation[] = [];
  lines.forEach((text, index) => {
    for (const rule of hygieneRules[platform]) {
      for (const match of text.matchAll(rule.pattern)) {
        found.push({ rule: rule.id, hint: rule.hint, line: index + 1, match: match[0] });
      }
    }
  });
  return found;
}
