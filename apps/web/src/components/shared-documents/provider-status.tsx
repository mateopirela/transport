'use client';

import {
  formatDateTime,
  providerActionLabels,
  providerActions,
  providerState,
  providerStateLabels,
  sharedDocumentsCopy,
  type ProviderState,
  type ProviderStatus,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { setProviderStatus } from '@/lib/shared-documents/actions';
import { cn } from '@/lib/utils';

const c = sharedDocumentsCopy.provider;

/** "Proveedor aprobado", "Alta pendiente"… as a pill (D21). */
export function ProviderBadge({ state }: { state: ProviderState }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap',
        state === 'approved' && 'border-success/30 bg-success/10 text-success',
        state === 'pending' && 'border-border bg-muted text-muted-foreground',
        (state === 'rejected' || state === 'revoked') &&
          'border-destructive/30 bg-destructive/5 text-destructive',
      )}
    >
      {providerStateLabels[state]}
    </span>
  );
}

/**
 * The shipper's provider decision about a carrier: its status and the
 * buttons of the transitions set_provider_status allows from it, with an
 * optional note the carrier will see. Informative in V1 (D21).
 */
export function ProviderStatusForm({
  carrierCompanyId,
  status,
  decidedAt,
}: {
  carrierCompanyId: string;
  status: ProviderStatus | null;
  decidedAt: string | null;
}) {
  const [result, action, pending] = useActionState(setProviderStatus, {});
  const notesId = useId();
  const state = providerState(status);
  const notesError = result.fieldErrors?.notes;
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-card p-4" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{c.title}</p>
        <ProviderBadge state={state} />
      </div>
      {decidedAt && state !== 'pending' && (
        <p className="text-xs text-muted-foreground">{c.decidedAt(formatDateTime(decidedAt))}</p>
      )}
      <p className="text-sm text-muted-foreground">{c.informative}</p>
      {result.error && <Notice tone="error">{result.error}</Notice>}
      {result.message && <Notice tone="success">{result.message}</Notice>}
      <input type="hidden" name="carrierCompanyId" value={carrierCompanyId} />
      <div className="space-y-1.5">
        <Label htmlFor={notesId}>{c.notes}</Label>
        <textarea
          id={notesId}
          name="notes"
          rows={2}
          maxLength={1000}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={`${notesId}-hint`}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p id={`${notesId}-hint`} className="text-xs text-muted-foreground">
          {c.notesHint}
        </p>
        {notesError && <p className="text-xs text-destructive">{notesError}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {providerActions(state).map((next) => (
          <Button
            key={next}
            type="submit"
            name="status"
            value={next}
            size="sm"
            variant={next === 'approved' ? 'accent' : 'outline'}
            disabled={pending}
          >
            {providerActionLabels[next]}
          </Button>
        ))}
      </div>
    </form>
  );
}
