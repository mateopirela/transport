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
import { Field, fieldHelpId } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { Textarea } from '@/components/ui/textarea';
import { setProviderStatus } from '@/lib/shared-documents/actions';
import { providerStateTone } from '@/lib/status-tones';

const c = sharedDocumentsCopy.provider;

/** "Proveedor aprobado", "Alta pendiente"… as a pill (D21). */
export function ProviderBadge({ state }: { state: ProviderState }) {
  return <Pill tone={providerStateTone(state)}>{providerStateLabels[state]}</Pill>;
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
  const helpId = fieldHelpId(notesId);
  return (
    <form action={action} className="space-y-4 rounded-2xl border bg-cell p-4" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-headline text-text">{c.title}</p>
        <ProviderBadge state={state} />
      </div>
      <div className="space-y-1">
        {decidedAt && state !== 'pending' && (
          <p className="text-footnote text-text-dim">{c.decidedAt(formatDateTime(decidedAt))}</p>
        )}
        <p className="text-subhead text-text-dim">{c.informative}</p>
      </div>
      {result.error && <Notice tone="error">{result.error}</Notice>}
      {result.message && <Notice tone="success">{result.message}</Notice>}
      <input type="hidden" name="carrierCompanyId" value={carrierCompanyId} />
      <Field label={c.notes} htmlFor={notesId} error={notesError} hint={c.notesHint}>
        <Textarea
          id={notesId}
          name="notes"
          rows={2}
          maxLength={1000}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={helpId}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {providerActions(state).map((next) => (
          <Button
            key={next}
            type="submit"
            name="status"
            value={next}
            size="sm"
            variant={next === 'approved' ? 'secondary' : 'destructive'}
            disabled={pending}
          >
            {providerActionLabels[next]}
          </Button>
        ))}
      </div>
    </form>
  );
}
