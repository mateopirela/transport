import { STATE_TONES, type StateTone } from '@transport/shared';
import { cva, type VariantProps } from 'class-variance-authority';

/*
 * The class recipes of the kit ("Fulmis", docs/plan-fulmis.md §1.3), kept apart
 * from the components so Vitest can check them as data.
 */

/**
 * The focus of every control (§1.3): a 2 px outline in the ink, 2 px away.
 * No `outline-none` next to it: in Tailwind 4 that would switch the outline
 * style off for the focused state too.
 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';

/**
 * Buttons (§1.3): radius 8, 40 px. One `primary` per screen (the accent,
 * filled); the rest are `secondary` (outlined), `plain` (text) or
 * `destructive` (outlined, in red). `danger` is the filled red that confirms
 * something irreversible inside a dialog, and `link` an inline text link.
 */
export const buttonVariants = cva(
  `inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors duration-200 select-none ${focusRing} disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:bg-accent/90',
        secondary: 'border border-control bg-cell text-text hover:bg-surface-high',
        plain: 'text-text-dim hover:bg-surface-high hover:text-text',
        destructive: 'border border-control bg-cell text-red-text hover:bg-surface-high',
        // The border keeps the edge on Night, where the red fill is close to the cell.
        danger: 'border border-red-text bg-red text-red-ink hover:bg-red/90',
        link: 'rounded-sm text-accent-text underline-offset-4 hover:underline',
      },
      size: {
        // 40 px (§1.3); 32 inside a row or a toolbar, 48 for the one action of a form.
        default: 'h-control px-4 text-subhead',
        sm: 'h-8 px-3 text-footnote',
        lg: 'h-12 px-6 text-callout',
        icon: 'size-control',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

/** The tones of a status pill: the six of `@transport/shared` (§1.1). */
export const PILL_TONES = STATE_TONES;
export type PillTone = StateTone;

/**
 * The fill and the ink of each tone (§1.1), the classes of `STATE_TONE_KEYS`:
 * always the ink of the tone on its fill, never the accent as small text.
 * `inactive` is the page with a border, since it has no fill of its own.
 */
const toneClasses = {
  attention: 'bg-accent text-accent-ink',
  progress: 'bg-info-fill text-info-ink',
  pending: 'bg-amber text-amber-ink',
  done: 'bg-surface-high text-text',
  problem: 'bg-red text-red-ink',
  inactive: 'border border-control bg-bg text-text-dim',
} satisfies Record<PillTone, string>;

/**
 * A status pill (§1.1, §1.3): radius 999, filled with its tone. The state is
 * never the colour alone: a pill always carries its words, and `done` a check.
 */
export const pillVariants = cva(
  'inline-flex h-6 max-w-full shrink-0 items-center gap-1 truncate rounded-full px-2.5 text-footnote font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: { tone: toneClasses },
    defaultVariants: { tone: 'inactive' },
  },
);

/** A small tag (radius 3) next to a thing: "Gerente", "Vence pronto". */
export const tagVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-caption font-semibold [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: { tone: toneClasses },
    defaultVariants: { tone: 'inactive' },
  },
);

/**
 * A field (§1.3): 40 px high (its component gives the height), radius 3, a
 * 1 px border in `control`, the ink on focus. 16 px under 1024 px, where a
 * phone would zoom into anything smaller, and 15 px on the desktop (§1.2).
 */
export const fieldControl = `w-full min-w-0 rounded-sm border border-control bg-cell px-3 text-callout text-text transition-colors duration-200 placeholder:text-text-dim focus-visible:border-text ${focusRing} disabled:cursor-not-allowed disabled:bg-surface-high disabled:text-text-dim aria-invalid:border-red-text lg:text-subhead`;

/**
 * A row inside a group: draws its own hairline separator, inset 16 from the
 * left (§1.3), above every row but the first.
 */
export const groupRow =
  'relative not-first:before:pointer-events-none not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:ml-4 not-first:before:h-px not-first:before:bg-separator';

/** A surface of the kit (§1.3): a cell with a hairline and no radius. */
export const surface = 'border bg-cell';

/** How a figure is written (§1.2): Geist 600, tabular. */
export const figure = 'font-semibold tabular-nums';

/** The sizes of an amount (§1.5): the main figure of a screen is the `numeral`. */
export const moneyVariants = cva('whitespace-nowrap tabular-nums', {
  variants: {
    size: {
      inline: 'font-semibold',
      title: 'text-title2 text-text',
      numeral: 'text-numeral text-text',
    },
  },
  defaultVariants: { size: 'inline' },
});

export type MoneyVariants = VariantProps<typeof moneyVariants>;

/** The state of one step of `Steps`. */
export const STEP_STATES = ['done', 'current', 'upcoming'] as const;
export type StepState = (typeof STEP_STATES)[number];

/** The mark of a step: a check on the neutral surface, the accent, or an empty ring. */
export const stepMarkVariants = cva(
  'flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold tabular-nums [&_svg]:size-3.5',
  {
    variants: {
      state: {
        done: 'bg-surface-high text-text',
        current: 'bg-accent text-accent-ink',
        upcoming: 'border border-control text-text-dim',
      } satisfies Record<StepState, string>,
    },
    defaultVariants: { state: 'upcoming' },
  },
);

/** The words of a step: the current one stands out by weight, not by colour. */
export const stepLabelVariants = cva('text-subhead', {
  variants: {
    state: {
      done: 'text-text',
      current: 'font-semibold text-text',
      upcoming: 'text-text-dim',
    } satisfies Record<StepState, string>,
  },
  defaultVariants: { state: 'upcoming' },
});

/** How a table cell lines up (§1.2): text to the left, a figure tabular. */
export const tableCellVariants = cva('', {
  variants: {
    align: {
      left: 'text-left',
      right: 'text-right',
    },
    numeric: {
      true: figure,
      false: '',
    },
  },
  defaultVariants: { align: 'left', numeric: false },
});

/** The classes of a table cell: a number goes to the right unless told otherwise. */
export function tableCellClass({
  numeric = false,
  align,
}: {
  numeric?: boolean;
  align?: 'left' | 'right';
} = {}): string {
  return tableCellVariants({ align: align ?? (numeric ? 'right' : 'left'), numeric });
}
