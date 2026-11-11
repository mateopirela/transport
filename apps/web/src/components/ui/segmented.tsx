'use client';

import Link from 'next/link';
import { RadioGroup } from 'radix-ui';

import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string> {
  value: T;
  label: string;
  /** A filter that lives in the URL: the segment is a link. */
  href?: string;
}

const track =
  'inline-flex max-w-full gap-1 overflow-x-auto rounded-sm border border-control bg-cell p-1';

/**
 * The classes of one segment (§1.3): radius 3 inside a bordered track. The
 * chosen one is the ink with the page as its text, never the accent: a filter
 * is not the action of the screen.
 */
export function segmentClass(selected: boolean): string {
  return cn(
    'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-sm px-3 text-footnote whitespace-nowrap transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text',
    selected ? 'bg-text font-semibold text-bg' : 'text-text-dim hover:text-text',
  );
}

/**
 * A segmented control to pick one of a few views or filters. With `href` on
 * the items it is a row of links (`aria-current` on the chosen one);
 * otherwise a radio group that calls `onChange`.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly SegmentedItem<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** The accessible name of the group. */
  label: string;
  className?: string;
}) {
  if (items.every((item) => item.href)) {
    return (
      <nav aria-label={label} className={cn(track, className)}>
        {items.map((item) => (
          <Link
            key={item.value}
            href={item.href ?? ''}
            aria-current={item.value === value ? 'page' : undefined}
            className={segmentClass(item.value === value)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }
  // Radix gives the radio group its keyboard: arrows move and choose.
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const item = items.find((candidate) => candidate.value === next);
        if (item) onChange?.(item.value);
      }}
      orientation="horizontal"
      className={cn(track, className)}
    >
      {items.map((item) => (
        <RadioGroup.Item
          key={item.value}
          value={item.value}
          className={segmentClass(item.value === value)}
        >
          {item.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
