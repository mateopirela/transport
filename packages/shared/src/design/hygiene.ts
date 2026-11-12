/**
 * The hygiene check of "Fulmis" (docs/plan-fulmis.md §0.4; it started in
 * docs/plan-rediseno.md §0.3, U9): outside the kits, a screen never writes a
 * colour, a font size or a radius by hand, and nothing of the older themes
 * (the deck's navy, the serif titles) is left. Three things are forbidden
 * everywhere, the kits and the theme files included (`strictHygieneRules`):
 * a shadow, the family of the previous system and the hexes of its palette.
 * Pure: it reads a file's text and says what it found; each app's test walks
 * its own `src` with it.
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
    hint: 'the old themes are gone: the ink is `text`, the families are Geist and Geist Mono',
    pattern: /\b(?:navy|Georgia|serif|Marcellus|Manrope)\b/gu,
  },
];

/** The family of the previous system, in any spelling (`Hanken_Grotesk`, `--font-hanken`…). */
const OLD_FONT: HygieneRule = {
  id: 'old-font',
  hint: 'Geist and Geist Mono (§1.2): Hanken Grotesk is retired',
  pattern: /hanken\w*/giu,
};

/** The palette of the previous system ("Nativo"): its light and dark themes, white cells included. */
const RETIRED_HEXES = [
  'F4F2EE',
  'FFFFFF',
  'E7E2DA',
  'ECE8E2',
  '1A1917',
  '6E6963',
  '736D67',
  '1F5EFF',
  '0F47D4',
  'E4ECFF',
  '2B8A57',
  '1F6B43',
  'B8781A',
  '8A5A12',
  'C0392B',
  'A52E22',
  'F4E9DA',
  '131214',
  '1D1C1F',
  '2D2B30',
  '2A282C',
  'F2F0EE',
  'A5A09B',
  '8F8A84',
  '5C8CFF',
  '8AB0FF',
  '0B1430',
  '1C2742',
  '5FCF95',
  'E9B45A',
  'FF8A7E',
  '3E3328',
] as const;

const OLD_PALETTE: HygieneRule = {
  id: 'old-palette',
  hint: 'a colour of Paper or Night (§1.1): this one belongs to the previous palette',
  // With or without an alpha pair behind it.
  pattern: new RegExp(
    `(?<![\\w&/#])#(?:${RETIRED_HEXES.join('|')})(?:[0-9a-f]{2})?(?![\\w-])`,
    'giu',
  ),
};

/**
 * The colour keys Fulmis retired (§1.1; their aliases lived until V9): as a
 * key of the palette, as a CSS variable and as a Tailwind colour class.
 */
const RETIRED_KEYS: HygieneRule = {
  id: 'retired-token',
  hint: 'a key of §1.1: textDim, surfaceHigh, bg, cell, separator; "done" is the ink (no green)',
  pattern: new RegExp(
    [
      String.raw`\b(?:textFaint|accentSoft|okText|glassLine)\b`,
      String.raw`\bcolors\.(?:ok|highlight|glass)\b`,
      String.raw`(?<![\w-])(?:--(?:color-)?|(?:text|bg|border|ring|outline|fill|stroke|divide|decoration)-)(?:text-faint|accent-soft|ok-text|glass-line|ok|highlight|glass)(?![\w-])`,
    ].join('|'),
    'gu',
  ),
};

const SHADOW_HINT =
  'a hairline (`separator`) instead: nothing casts a shadow (§1.3), the kits included';

/** A shadow in a style object: the app's StyleSheets and the web's inline `style` alike. */
const STYLE_SHADOW: HygieneRule = {
  id: 'shadow',
  hint: SHADOW_HINT,
  pattern: /\b(?:shadow(?:Color|Opacity|Radius|Offset)|boxShadow|textShadow|elevation)\s*:/gu,
};

/** A shadow as a Tailwind class. */
const CLASS_SHADOW: HygieneRule = {
  id: 'shadow',
  hint: SHADOW_HINT,
  pattern:
    /(?<![\w-])(?:shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner|\[[^\]]*\]))?|drop-shadow(?:-\w+)?)(?=["'`\s}])/gu,
};

/** A shadow as a CSS declaration or filter (the web's stylesheets). */
const CSS_SHADOW: HygieneRule = {
  id: 'shadow',
  hint: SHADOW_HINT,
  pattern: /(?<![\w-])(?:box-shadow|text-shadow)\s*:|(?<![\w-])drop-shadow\(/gu,
};

/**
 * Style properties written by hand: in the app's StyleSheets and in the web's
 * inline `style` objects alike (a number, or a string that starts with one).
 */
function styleProperties(hints: { size: string; radius: string }): HygieneRule[] {
  return [
    {
      id: 'font-size',
      hint: hints.size,
      pattern: /\bfontSize\s*:\s*['"`]?\d+(?:\.\d+)?/gu,
    },
    {
      id: 'border-radius',
      hint: hints.radius,
      pattern: /\bborder(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*['"`]?\d+(?:\.\d+)?/gu,
    },
    STYLE_SHADOW,
  ];
}

const MOBILE: readonly HygieneRule[] = styleProperties({
  size: 'a style of the type scale (useTheme().type)',
  radius: 'a radius of `shape` or `radii`',
});

const PALETTE_HUES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITIES =
  'text|bg|border|ring|outline|fill|stroke|from|via|to|divide|decoration|placeholder|caret|accent';

const WEB: readonly HygieneRule[] = [
  ...styleProperties({
    size: 'a step of the type scale as a class (text-body, text-subhead…)',
    radius: 'a radius class of the scale (§1.3: 0, 3, 8 or rounded-full)',
  }),
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
    hint: 'a radius of the scale (§1.3: 0, 3, 8 or rounded-full), never one in brackets',
    pattern: /(?<![\w-])rounded(?:-[trblse]{1,2})?-\[/gu,
  },
  CLASS_SHADOW,
  CSS_SHADOW,
];

/** The rules of each platform outside its kit: the common ones and its own. */
export const hygieneRules: Readonly<Record<HygienePlatform, readonly HygieneRule[]>> =
  Object.freeze({
    mobile: [...COMMON, OLD_FONT, RETIRED_KEYS, ...MOBILE],
    web: [...COMMON, OLD_FONT, RETIRED_KEYS, ...WEB],
  });

/**
 * The rules with no exception: they hold in the kits, the theme and the
 * stylesheets too, where the other values live. Outside the kits every hex is
 * forbidden already (`hex-color`); here only the previous palette is.
 */
export const strictHygieneRules: Readonly<Record<HygienePlatform, readonly HygieneRule[]>> =
  Object.freeze({
    mobile: [OLD_FONT, OLD_PALETTE, RETIRED_KEYS, STYLE_SHADOW],
    web: [OLD_FONT, OLD_PALETTE, RETIRED_KEYS, STYLE_SHADOW, CLASS_SHADOW, CSS_SHADOW],
  });

/**
 * Blanks out comments (keeping the line breaks, so lines still count right):
 * a comment may name what it no longer does ("no shadow", "not navy"). It
 * reads the text once, so a `//` or a `/*` inside a string ('https://…',
 * '/*') is not a comment, and a `//` right after code (`work();// …`) is.
 * Regular expression literals are not told apart: a `//` in one blanks the
 * rest of its line, which can only hide a match, never invent one.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const c = source[i] ?? '';
    const next = source[i + 1] ?? '';
    if (quote) {
      if (c === '\\') {
        out += c + next;
        i += 2;
        continue;
      }
      // A line break ends a stray quote (an apostrophe in JSX text), not a template.
      if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      out += c;
      i += 1;
    } else if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/gu, ' ');
      i = stop;
    } else {
      if (c === "'" || c === '"' || c === '`') quote = c;
      out += c;
      i += 1;
    }
  }
  return out;
}

function findViolations(source: string, rules: readonly HygieneRule[]): HygieneViolation[] {
  const lines = stripComments(source).split('\n');
  const found: HygieneViolation[] = [];
  lines.forEach((text, index) => {
    for (const rule of rules) {
      for (const match of text.matchAll(rule.pattern)) {
        found.push({ rule: rule.id, hint: rule.hint, line: index + 1, match: match[0] });
      }
    }
  });
  return found;
}

/** What a file's text breaks of the hygiene rules of its platform, line by line. */
export function findHygieneViolations(
  source: string,
  platform: HygienePlatform,
): HygieneViolation[] {
  return findViolations(source, hygieneRules[platform]);
}

/**
 * What a file's text breaks of the rules with no exception (shadows, the
 * previous family, the previous palette, the retired keys): for every file,
 * the kits included.
 */
export function findStrictHygieneViolations(
  source: string,
  platform: HygienePlatform,
): HygieneViolation[] {
  return findViolations(source, strictHygieneRules[platform]);
}
