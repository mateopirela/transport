'use client';

import { clientTripsCopy, INCIDENT_KINDS, incidentKindLabels } from '@transport/shared';
import { useActionState, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Disclosure } from '@/components/disclosure';
import { Button } from '@/components/ui/button';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { nextAttemptKey } from '@/lib/attempt-key';
import type { FormState } from '@/lib/forms';
import { confirmDelivery, reportIncident } from '@/lib/trips/actions';

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
    <form action={action} className="space-y-4 rounded-2xl border bg-cell p-4" noValidate>
      <div className="space-y-1">
        <p className="text-headline text-text">{c.title}</p>
        <p className="text-subhead text-text-dim">{c.help}</p>
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="clientEventId" value={attemptKey} />
      <Field label={c.notes} htmlFor="delivery-notes" error={notesError}>
        <Textarea
          id="delivery-notes"
          name="notes"
          rows={2}
          maxLength={1000}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? fieldHelpId('delivery-notes') : undefined}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending} loading={pending}>
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
      <Disclosure summary={c.report} open={Boolean(state.error || kindError || descriptionError)}>
        <form action={action} className="space-y-4" noValidate>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="clientEventId" value={attemptKey} />
          <Field label={c.kind} htmlFor="incident-kind" error={kindError}>
            <Select
              id="incident-kind"
              name="kind"
              defaultValue={state.values?.kind ?? ''}
              aria-invalid={kindError ? true : undefined}
              aria-describedby={kindError ? fieldHelpId('incident-kind') : undefined}
            >
              <option value="" disabled />
              {INCIDENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {incidentKindLabels[kind]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={c.description} htmlFor="incident-description" error={descriptionError}>
            <Textarea
              id="incident-description"
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={state.values?.description}
              aria-invalid={descriptionError ? true : undefined}
              aria-describedby={descriptionError ? fieldHelpId('incident-description') : undefined}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={pending}
            loading={pending}
          >
            {pending ? c.submitting : c.submit}
          </Button>
        </form>
      </Disclosure>
      {state.message && <Notice tone="success">{state.message}</Notice>}
    </div>
  );
}
