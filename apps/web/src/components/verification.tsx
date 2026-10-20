import {
  formatDate,
  formatDateTime,
  onboardingCopy,
  requirementStateLabels,
  verificationStatusLabels,
  type RequirementState,
} from '@transport/shared';

import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { requirementStateTone } from '@/lib/status-tones';
import type { Progress } from '@/lib/verification/queries';
import { cn } from '@/lib/utils';

const c = onboardingCopy.documents;

/** Pill with the Spanish label of a requirement or verification status. */
export function StatusBadge({
  state,
  kind = 'requirement',
}: {
  state: RequirementState;
  kind?: 'requirement' | 'verification';
}) {
  const label =
    kind === 'verification' && state !== 'missing'
      ? verificationStatusLabels[state]
      : requirementStateLabels[state];
  return <Pill tone={requirementStateTone(state)}>{label}</Pill>;
}

/**
 * One row per requirement with its state, the latest file and the reviewer's
 * notes. `action` renders the controls of each row (upload or review).
 */
export function RequirementList({
  progress,
  action,
}: {
  progress: Progress;
  action?: (item: Progress[number]) => React.ReactNode;
}) {
  return (
    <ul className="overflow-hidden rounded-2xl border bg-cell">
      {progress.map((item) => {
        const { requirement, document, state } = item;
        return (
          <li key={requirement.id} className={cn(groupRow, 'space-y-3 px-4 py-3.5')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-body text-text">
                  {requirement.name}
                  <span className="ml-2 text-footnote text-text-dim">
                    {requirement.is_required ? c.required : c.optional}
                  </span>
                </p>
                {requirement.description && (
                  <p className="text-subhead text-text-dim">{requirement.description}</p>
                )}
              </div>
              <StatusBadge state={state} />
            </div>
            {document && (
              <dl className="grid gap-1 text-subhead sm:grid-cols-[max-content_1fr] sm:gap-x-4">
                <dt className="text-text-dim">{c.submittedFile}</dt>
                <dd className="break-all">
                  {document.file_name ?? '—'} · {formatDateTime(document.created_at)}
                </dd>
                {document.expires_at && (
                  <>
                    <dt className="text-text-dim">{c.expiresOn}</dt>
                    <dd>{c.validUntil(formatDate(document.expires_at))}</dd>
                  </>
                )}
                {document.status === 'rejected' && document.review_notes && (
                  <>
                    <dt className="text-red-text">{c.rejectionReason}</dt>
                    <dd className="text-red-text">{document.review_notes}</dd>
                  </>
                )}
              </dl>
            )}
            {action?.(item)}
          </li>
        );
      })}
    </ul>
  );
}
