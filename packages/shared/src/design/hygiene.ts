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
    {
      id: 'shadow',
      hint: 'hairlines instead of shadows (§1.3); the kit owns the only two',
      pattern: /\b(?:shadow(?:Color|Opacity|Radius|Offset)|boxShadow|textShadow|elevation)\s*:/gu,
    },
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
    radius: 'a radius class (rounded-md, rounded-2xl, rounded-sm, rounded-full)',
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
