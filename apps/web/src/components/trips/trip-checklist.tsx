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

import { Group } from '@/components/ui/group';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
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
    <div className="space-y-5">
      <Pill tone={pending === 0 ? 'ok' : 'amber'} role="status">
        {c.pendingCount(pending)}
      </Pill>
      {groups.map((group) => (
        <section key={group.stage}>
          <h3 className="mb-1.5 px-4 text-label text-text-dim">
            {stages[group.stage] ?? c.unknownStage(group.stage)}
          </h3>
          <Group>
            <ul>
              {group.rows.map((row) => (
                <li
                  key={row.code}
                  className={cn(
                    groupRow,
                    'flex min-h-12.5 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-text">{checklistItemLabel(row.code)}</p>
                    <p className="text-footnote text-text-dim">
                      {responsibles[row.responsible] ?? row.responsible} ·{' '}
                      {row.required ? c.required : c.optional}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-footnote tabular-nums',
                      row.done_at ? 'text-ok-text' : 'text-text-dim',
                    )}
                  >
                    {row.done_at ? c.done(formatDateTime(row.done_at)) : c.pending}
                  </span>
                </li>
              ))}
            </ul>
          </Group>
        </section>
      ))}
    </div>
  );
}
