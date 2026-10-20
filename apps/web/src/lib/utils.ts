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
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...TYPE_STYLES] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
