import { cva, type VariantProps } from 'class-variance-authority';

/*
 * The class recipes of the kit ("Transport · Nativo", docs/plan-rediseno.md
 * §1.6), kept apart from the components so Vitest can check them as data.
 */

/**
 * Pill buttons (§1.3): one `primary` per screen (the accent, filled), the
 * rest `secondary` (a cell), `plain` (text) or `destructive` (a cell in red).
 * `link` is an inline text link that looks like a button's label.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors duration-200 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:bg-accent/90',
        secondary: 'border bg-cell text-text hover:bg-surface-high',
        plain: 'text-text-dim hover:bg-surface-high hover:text-text',
        destructive: 'border bg-cell text-red-text hover:bg-red/10',
        link: 'rounded-sm text-accent-text underline-offset-4 hover:underline',
      },
      size: {
        // 44 px, and 36 the small one (§1.6).
        default: 'h-11 px-5 text-callout',
        sm: 'h-9 px-4 text-subhead',
        icon: 'size-11',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

/** The tones of a status pill: neutral, the accent, and the three states. */
export const PILL_TONES = ['neutral', 'accent', 'ok', 'amber', 'red'] as const;
export type PillTone = (typeof PILL_TONES)[number];

/**
 * A status pill (§1.1): the `*Text` tone on its base tone at 14 %, which
 * meets AA on `cell` and `bg` (tested in shared/design/tokens.test.ts).
 */
export const pillVariants = cva(
  'inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-footnote font-semibold',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-high text-text-dim',
        accent: 'bg-accent/14 text-accent-text',
        ok: 'bg-ok/14 text-ok-text',
        amber: 'bg-amber/14 text-amber-text',
        red: 'bg-red/14 text-red-text',
      } satisfies Record<PillTone, string>,
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/** A small tag (radius 6) next to a thing: "Gerente", "Vence pronto". */
export const tagVariants = cva(
  'inline-flex shrink-0 items-center rounded-sm px-1.5 py-px text-caption font-semibold',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-high text-text-dim',
        accent: 'bg-accent-soft text-accent-text',
        ok: 'bg-ok/14 text-ok-text',
        amber: 'bg-amber/14 text-amber-text',
        red: 'bg-red/14 text-red-text',
      } satisfies Record<PillTone, string>,
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/** A field (§1.3): 44 px high, radius 12, a hairline, the accent ring on focus. */
export const fieldControl =
  'w-full min-w-0 rounded-md border bg-cell px-3.5 text-callout text-text transition-[border-color,box-shadow] duration-200 outline-none placeholder:text-text-faint focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-high disabled:text-text-dim aria-invalid:border-red aria-invalid:ring-red/15';

/**
 * A row inside a group: draws its own hairline separator, inset 16 from the
 * left (§1.3), above every row but the first.
 */
export const groupRow =
  'relative not-first:before:pointer-events-none not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:ml-4 not-first:before:h-px not-first:before:bg-separator';
