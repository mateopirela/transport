import { loadStatusLabels, type LoadStatus } from '@transport/shared';

import { cn } from '@/lib/utils';

const TONE: Record<LoadStatus, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  published: 'border-accent/30 bg-accent/10 text-accent',
  negotiating: 'border-accent/30 bg-accent/10 text-accent',
  contracted: 'border-success/30 bg-success/10 text-success',
  in_progress: 'border-success/30 bg-success/10 text-success',
  completed: 'border-border bg-muted text-foreground',
  cancelled: 'border-destructive/30 bg-destructive/5 text-destructive',
  expired: 'border-border bg-muted text-muted-foreground',
};

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap',
        TONE[status],
      )}
    >
      {loadStatusLabels[status]}
    </span>
  );
}
