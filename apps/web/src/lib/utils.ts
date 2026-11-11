import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The type scale of globals.css (§1.2). Without it, tailwind-merge reads
 * `text-footnote` as a colour and drops it next to `text-text-dim`.
 */
export const TYPE_STYLES = [
  'large-title',
  'title1',
  'title2',
  'title3',
  'headline',
  'body',
  'callout',
  'subhead',
  'footnote',
  'caption',
  'label',
  'meta',
  'numeral',
  'table',
] as const;

/**
 * The heights of globals.css (§1.3). Without them, tailwind-merge does not see
 * `h-control` as a height and keeps it next to the `h-auto` that replaces it.
 */
export const SIZE_STEPS = ['control', 'table-row'] as const;

const twMerge = extendTailwindMerge({
  extend: {
    theme: { spacing: [...SIZE_STEPS] },
    classGroups: { 'font-size': [{ text: [...TYPE_STYLES] }] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
