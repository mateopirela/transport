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

const track = 'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-surface-high p-0.5';

/** The classes of one segment; the selected one is a cell with the only shadow allowed (§1.3). */
export function segmentClass(selected: boolean): string {
  return cn(
    'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full px-3.5 text-subhead whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
    selected ? 'bg-cell font-semibold text-text shadow-xs' : 'text-text-dim hover:text-text',
  );
}

/**
 * A segmented control (§1.6) to pick one of a few views or filters. With
 * `href` on the items it is a row of links (`aria-current` on the chosen
 * one); otherwise a radio group that calls `onChange`.
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
