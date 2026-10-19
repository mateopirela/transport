import {
  formatDateTime,
  groupTripChecklist,
  isTripDocumentCode,
  TRIP_DOCUMENT_KINDS,
  tripChecklistCopy as c,
  tripChecklistPending,
  tripDocumentKindLabels,
  type TripChecklistRow,
} from '@transport/shared';

import { cn } from '@/lib/utils';

/** Label of a checklist row: a document kind or one of the operator's items. */
export function checklistItemLabel(code: string): string {
  if (isTripDocumentCode(code, TRIP_DOCUMENT_KINDS)) return tripDocumentKindLabels[code];
  return c.items[code] ?? code;
}

const stages: Record<string, string> = c.stages;
const responsibles: Record<string, string> = c.responsible;

/**
 * The checklist of a trip (D22) by stage: each document, the photos and the
 * signed delivery, with who does it and whether it is done.
 */
export function TripChecklist({ rows }: { rows: readonly TripChecklistRow[] }) {
  const groups = groupTripChecklist(rows);
  const pending = tripChecklistPending(rows);
  return (
    <div className="space-y-3">
      <p
        className={cn(
          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
          pending === 0 ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent',
        )}
        role="status"
      >
        {c.pendingCount(pending)}
      </p>
      {groups.map((group) => (
        <section key={group.stage} className="space-y-1">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            {stages[group.stage] ?? c.unknownStage(group.stage)}
          </h3>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {group.rows.map((row) => (
              <li
                key={row.code}
                className="flex flex-wrap items-baseline justify-between gap-2 p-3"
              >
                <div>
                  <p className="font-medium">{checklistItemLabel(row.code)}</p>
                  <p className="text-xs text-muted-foreground">
                    {responsibles[row.responsible] ?? row.responsible} ·{' '}
                    {row.required ? c.required : c.optional}
                  </p>
                </div>
                <span
                  className={cn('text-xs', row.done_at ? 'text-success' : 'text-muted-foreground')}
                >
                  {row.done_at ? c.done(formatDateTime(row.done_at)) : c.pending}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
