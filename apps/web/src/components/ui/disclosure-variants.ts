import { cva, type VariantProps } from 'class-variance-authority';

import { focusRing, groupRow } from './variants';

/*
 * The recipe of `Disclosure`, apart from the component so Vitest can check it
 * as data, like variants.ts.
 */

/**
 * A folded action or form: a row of a `Group` (`row`, with its inset
 * separator), a cell on its own (`cell`: a hairline, no radius) or a line of
 * text inside a table cell or a row (`inline`).
 */
export const disclosureVariants = cva('group/disclosure', {
  variants: {
    look: {
      row: groupRow,
      cell: 'overflow-hidden border bg-cell',
      inline: '',
    },
  },
  defaultVariants: { look: 'row' },
});

// A row hovers on the page colour, not on the raised surface: its label may be accent text (§1.1).
const rowSummary =
  'min-h-table-row justify-between px-4 py-2.5 text-subhead font-medium hover:bg-bg focus-visible:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text';

/**
 * The summary line: 44 px like a cell (a short line when `inline`), the label
 * in its tone and a chevron that turns when it opens. `red` for what
 * archives, cancels, removes or rejects; `accent` for a step forward
 * (accept); `neutral` for the rest.
 */
export const disclosureSummaryVariants = cva(
  'flex cursor-pointer list-none items-center gap-3 transition-colors duration-150 select-none [&::-webkit-details-marker]:hidden',
  {
    variants: {
      look: {
        row: rowSummary,
        cell: rowSummary,
        inline: `w-fit gap-1 rounded-sm py-1 text-subhead hover:underline ${focusRing}`,
      },
      tone: {
        neutral: 'text-text',
        accent: 'text-accent-text',
        red: 'text-red-text',
      },
    },
    defaultVariants: { look: 'row', tone: 'neutral' },
  },
);

/**
 * The content under the summary: inset like the summary, flush when `inline`.
 * A cell on its own opens under a hairline, like the next row of a group.
 */
export const disclosureBodyVariants = cva('', {
  variants: {
    look: {
      row: 'space-y-3 px-4 pt-1 pb-4',
      cell: 'space-y-4 border-t p-4',
      inline: 'space-y-3 pt-2 pb-1',
    },
  },
  defaultVariants: { look: 'row' },
});

export type DisclosureVariants = VariantProps<typeof disclosureVariants> &
  VariantProps<typeof disclosureSummaryVariants>;
