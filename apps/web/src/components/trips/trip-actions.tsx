'use client';

import { clientTripsCopy, INCIDENT_KINDS, incidentKindLabels } from '@transport/shared';
import { useActionState, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { nextAttemptKey } from '@/lib/attempt-key';
import type { FormState } from '@/lib/forms';
import { confirmDelivery, reportIncident } from '@/lib/trips/actions';

const textarea = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/**
 * Confirms the delivery of a delivered trip, with optional notes. Every submit
 * of the same confirmation carries the same clientEventId, so a double submit
 * or a retry after an error shows success instead of a status error.
 */
export function ConfirmDeliveryForm({
  tripId,
  clientEventId,
}: {
  tripId: string;
  /** First attempt key (a fresh UUID from the server render). */
  clientEventId: string;
}) {
  const c = clientTripsCopy.delivery;
  const [state, action, pending] = useActionState(confirmDelivery, {});
  const attemptKey = useAttemptKey(clientEventId, state);
  const notesError = state.fieldErrors?.notes;
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-card p-4" noValidate>
      <p className="font-medium">{c.title}</p>
      <p className="text-sm text-muted-foreground">{c.help}</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="clientEventId" value={attemptKey} />
      <div className="space-y-1.5">
        <Label htmlFor="delivery-notes">{c.notes}</Label>
        <textarea
          id="delivery-notes"
          name="notes"
          rows={2}
          maxLength={1000}
          aria-invalid={notesError ? true : undefined}
          className={textarea}
        />
        {notesError && <p className="text-xs text-destructive">{notesError}</p>}
      </div>
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? c.confirming : c.confirm}
      </Button>
    </form>
  );
}

/**
 * Key of the current submission attempt (see nextAttemptKey). The first one
 * comes from the server, so the hydrated form keeps the value it was rendered
 * with; each success then starts a new attempt in the browser.
 */
function useAttemptKey(initialKey: string, state: FormState): string {
  const [attempt, setAttempt] = useState({ key: initialKey, state });
  if (attempt.state === state) return attempt.key;
  const key = nextAttemptKey(attempt.key, state);
  setAttempt({ key, state });
  return key;
}

/**
 * Reports an incident on the trip: kind and description. Every submit of the
 * same report carries the same clientEventId, so a double submit or a retry
 * after an error does not report it twice. The carrier web (G10b) mounts it
 * with its own action; the labels are the same for both parties.
 */
export function ReportIncidentForm({
  tripId,
  clientEventId,
  reportAction = reportIncident,
}: {
  tripId: string;
  /** First attempt key (a fresh UUID from the server render). */
  clientEventId: string;
  /** Server action of the area (the shipper's by default). */
  reportAction?: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const c = clientTripsCopy.incidents;
  const [state, action, pending] = useActionState(reportAction, {});
  const attemptKey = useAttemptKey(clientEventId, state);
  const kindError = state.fieldErrors?.kind;
  const descriptionError = state.fieldErrors?.description;
  return (
    <div className="space-y-2">
      <details
        className="rounded-lg border p-4 open:bg-muted/40"
        open={Boolean(state.error || kindError || descriptionError)}
      >
        <summary className="cursor-pointer text-sm font-medium">{c.report}</summary>
        <form action={action} className="mt-4 space-y-3" noValidate>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="clientEventId" value={attemptKey} />
          <div className="space-y-1.5">
            <Label htmlFor="incident-kind">{c.kind}</Label>
            <select
              id="incident-kind"
              name="kind"
              defaultValue={state.values?.kind ?? ''}
              aria-invalid={kindError ? true : undefined}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled />
              {INCIDENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {incidentKindLabels[kind]}
                </option>
              ))}
            </select>
            {kindError && <p className="text-xs text-destructive">{kindError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-description">{c.description}</Label>
            <textarea
              id="incident-description"
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={state.values?.description}
              aria-invalid={descriptionError ? true : undefined}
              className={textarea}
            />
            {descriptionError && <p className="text-xs text-destructive">{descriptionError}</p>}
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? c.submitting : c.submit}
          </Button>
        </form>
      </details>
      {state.message && <Notice tone="success">{state.message}</Notice>}
    </div>
  );
}
