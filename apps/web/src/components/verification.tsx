import {
  formatDate,
  formatDateTime,
  onboardingCopy,
  requirementStateLabels,
  verificationStatusLabels,
  type RequirementState,
} from '@transport/shared';

import type { Progress } from '@/lib/verification/queries';
import { cn } from '@/lib/utils';

const c = onboardingCopy.documents;

const TONES: Record<RequirementState, string> = {
  missing: 'bg-muted text-muted-foreground',
  pending_review: 'bg-accent/10 text-accent',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  expired: 'bg-destructive/10 text-destructive',
  suspended: 'bg-destructive/10 text-destructive',
};

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
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[state],
      )}
    >
      {label}
    </span>
  );
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
    <ul className="divide-y rounded-lg border">
      {progress.map((item) => {
        const { requirement, document, state } = item;
        return (
          <li key={requirement.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="font-medium">
                  {requirement.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {requirement.is_required ? c.required : c.optional}
                  </span>
                </p>
                {requirement.description && (
                  <p className="text-sm text-muted-foreground">{requirement.description}</p>
                )}
              </div>
              <StatusBadge state={state} />
            </div>
            {document && (
              <dl className="grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
                <dt className="text-muted-foreground">{c.submittedFile}</dt>
                <dd className="break-all">
                  {document.file_name ?? '—'} · {formatDateTime(document.created_at)}
                </dd>
                {document.expires_at && (
                  <>
                    <dt className="text-muted-foreground">{c.expiresOn}</dt>
                    <dd>{c.validUntil(formatDate(document.expires_at))}</dd>
                  </>
                )}
                {document.status === 'rejected' && document.review_notes && (
                  <>
                    <dt className="text-destructive">{c.rejectionReason}</dt>
                    <dd className="text-destructive">{document.review_notes}</dd>
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
