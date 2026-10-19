'use client';

import {
  TRIP_CANCELLATION_REASONS,
  tripCancelCopy,
  tripCancellationReasonLabels,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
    <details
      className="rounded-lg border p-4 open:bg-muted/40"
      open={Boolean(state.error || state.fieldErrors)}
    >
      <summary className="cursor-pointer text-sm font-medium text-destructive">{c.open}</summary>
      <form action={action} className="mt-4 space-y-3" noValidate>
        <p className="font-medium">{c.title}</p>
        <p className="text-sm text-muted-foreground">{c.help}</p>
        {onTheWay && <Notice tone="info">{c.onTheWay}</Notice>}
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>{c.reason}</Label>
          <select
            id={`${id}-reason`}
            name="reasonCode"
            defaultValue={state.values?.reasonCode ?? ''}
            aria-invalid={errors.reasonCode ? true : undefined}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="" disabled>
              {c.choose}
            </option>
            {TRIP_CANCELLATION_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {tripCancellationReasonLabels[reason]}
              </option>
            ))}
          </select>
          {errors.reasonCode && <p className="text-xs text-destructive">{errors.reasonCode}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-notes`}>{c.notes}</Label>
          <textarea
            id={`${id}-notes`}
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={state.values?.notes}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={`${id}-notes-hint`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p id={`${id}-notes-hint`} className="text-xs text-muted-foreground">
            {c.notesHint}
          </p>
          {errors.notes && <p className="text-xs text-destructive">{errors.notes}</p>}
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? c.cancelling : c.confirm}
        </Button>
      </form>
    </details>
  );
}
