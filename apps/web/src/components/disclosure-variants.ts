import { cva, type VariantProps } from 'class-variance-authority';

/*
 * The class recipes of `Disclosure` (an action folded in a cell until opened:
 * accept, counter, cancel, report), kept apart so Vitest can check them as
 * data. U9 moves them to the kit (components/ui/variants.ts).
 */

/** The folded cell: white on the page, radius 16, a hairline. */
export const disclosureFrame = 'group overflow-hidden rounded-2xl border bg-cell';

/** The row that opens it: a cell of 50 px whose label takes the action's tone. */
export const disclosureSummary = cva(
  'flex min-h-12.5 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-body font-semibold transition-colors duration-150 outline-none select-none hover:bg-surface-high/60 focus-visible:bg-surface-high [&::-webkit-details-marker]:hidden',
  {
    variants: {
      tone: {
        neutral: 'text-text',
        accent: 'text-accent-text',
        ok: 'text-ok-text',
        red: 'text-red-text',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type DisclosureTone = NonNullable<VariantProps<typeof disclosureSummary>['tone']>;

/** What opens under the row: separated by a hairline. */
export const disclosureBody = 'space-y-4 border-t px-4 py-4';
