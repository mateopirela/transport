'use client';

import {
  TRIP_CANCELLATION_REASONS,
  tripCancelCopy,
  tripCancellationReasonLabels,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { Notice } from '@/components/auth-forms';
import { Disclosure } from '@/components/disclosure';
import { Button } from '@/components/ui/button';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/lib/forms';

const c = tripCancelCopy;

/**
 * Cancels a trip before the operator starts loading (cancel_trip, G5): a
 * reason from the list and notes (required for "Otro"), which the other side
 * and the operator see. Used by the shipper and the carrier staff. When the
 * unit already set off it warns that it will wait for its release (D20).
 * Folded until opened, so a stray click never cancels anything. Once
 * cancelled the page reloads without the form and shows the trip as
 * cancelled with its reason: that notice is the confirmation.
 */
export function TripCancelForm({
  tripId,
  action: cancel,
  onTheWay,
}: {
  tripId: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  onTheWay: boolean;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(cancel, {});
  const errors = state.fieldErrors ?? {};
  return (
    <Disclosure summary={c.open} tone="red" open={Boolean(state.error || state.fieldErrors)}>
      <form action={action} className="space-y-4" noValidate>
        <div className="space-y-1">
          <p className="text-headline text-text">{c.title}</p>
          <p className="text-subhead text-text-dim">{c.help}</p>
        </div>
        {onTheWay && <Notice tone="info">{c.onTheWay}</Notice>}
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="tripId" value={tripId} />
        <Field label={c.reason} htmlFor={`${id}-reason`} error={errors.reasonCode}>
          <Select
            id={`${id}-reason`}
            name="reasonCode"
            defaultValue={state.values?.reasonCode ?? ''}
            aria-invalid={errors.reasonCode ? true : undefined}
            aria-describedby={errors.reasonCode ? fieldHelpId(`${id}-reason`) : undefined}
          >
            <option value="" disabled>
              {c.choose}
            </option>
            {TRIP_CANCELLATION_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {tripCancellationReasonLabels[reason]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={c.notes} htmlFor={`${id}-notes`} error={errors.notes} hint={c.notesHint}>
          <Textarea
            id={`${id}-notes`}
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={state.values?.notes}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={fieldHelpId(`${id}-notes`)}
          />
        </Field>
        <Button
          type="submit"
          variant="destructive"
          className="w-full"
          disabled={pending}
          loading={pending}
        >
          {pending ? c.cancelling : c.confirm}
        </Button>
      </form>
    </Disclosure>
  );
}
