import { isTripActive, tripStatusLabels, type TripStatus } from '@transport/shared';

import { cn } from '@/lib/utils';

function tone(status: TripStatus): string {
  if (status === 'cancelled') return 'border-destructive/30 bg-destructive/5 text-destructive';
  if (status === 'delivered') return 'border-success/30 bg-success/10 text-success';
  if (isTripActive(status)) return 'border-accent/30 bg-accent/10 text-accent';
  return 'border-border bg-muted text-muted-foreground';
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap',
        tone(status),
      )}
    >
      {tripStatusLabels[status]}
    </span>
  );
}
