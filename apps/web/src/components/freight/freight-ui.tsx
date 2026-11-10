import {
  formatCalendarDate,
  formatMxn,
  freightCarrierStatusLabels,
  freightCarrierStatusTone,
  freightClientStatusLabels,
  freightClientStatusTone,
  type FreightCarrierStatus,
  type FreightClientStatus,
} from '@transport/shared';

import { Pill } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

/** The totals of Cobranza or Cartera: up to three tiles, the amount large. */
export function FreightTotals({
  items,
  className,
}: {
  items: readonly { label: string; cents: number; testId: string; tone?: 'red' | 'amber' }[];
  className?: string;
}) {
  return (
    <dl className={cn('mb-8 grid gap-3 sm:grid-cols-3', className)}>
      {items.map((item) => (
        <div key={item.testId} className="rounded-2xl border bg-cell px-4 py-3.5">
          <dt className="text-subhead text-text-dim">{item.label}</dt>
          <dd
            data-testid={item.testId}
            className={cn(
              'mt-1 text-title2 text-text tabular-nums',
              item.cents > 0 && item.tone === 'red' && 'text-red-text',
              item.cents > 0 && item.tone === 'amber' && 'text-amber-text',
            )}
          >
            {formatMxn(item.cents)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ClientStatusPill({ status }: { status: FreightClientStatus }) {
  return <Pill tone={freightClientStatusTone(status)}>{freightClientStatusLabels[status]}</Pill>;
}

export function CarrierStatusPill({ status }: { status: FreightCarrierStatus }) {
  return <Pill tone={freightCarrierStatusTone(status)}>{freightCarrierStatusLabels[status]}</Pill>;
}

/** A calendar date ("10 dic 2026"), or the fallback when there is none. */
export function dueLabel(date: string | null, fallback: string): string {
  return date ? formatCalendarDate(date) : fallback;
}
