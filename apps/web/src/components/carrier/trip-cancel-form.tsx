'use client';

import { carrierWebCopy } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cancelCarrierTrip } from '@/lib/carrier/trip-actions';

const c = carrierWebCopy.trips.cancel;

/**
 * Cancels a won trip before the operator starts loading (cancel_trip, B06),
 * with a reason the shipper and the operator see. Folded until opened, so a
 * stray click never cancels anything.
 */
export function TripCancelForm({ tripId }: { tripId: string }) {
  const id = useId();
  const [state, action, pending] = useActionState(cancelCarrierTrip, {});
  const reasonError = state.fieldErrors?.reason;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return (
    <details className="rounded-lg border p-4 open:bg-muted/40" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-sm font-medium text-destructive">{c.open}</summary>
      <form action={action} className="mt-4 space-y-3" noValidate>
        <p className="font-medium">{c.title}</p>
        <p className="text-sm text-muted-foreground">{c.help}</p>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>{c.reason}</Label>
          <textarea
            id={`${id}-reason`}
            name="reason"
            rows={2}
            maxLength={1000}
            defaultValue={state.values?.reason}
            aria-invalid={reasonError ? true : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? c.cancelling : c.confirm}
        </Button>
      </form>
    </details>
  );
}
