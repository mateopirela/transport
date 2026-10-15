'use client';

import { loadsCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cancelLoad, publishLoad } from '@/lib/loads/actions';

const c = loadsCopy.actions;

/** Publishes a draft. */
export function PublishLoadButton({ loadId }: { loadId: string }) {
  const [state, action, pending] = useActionState(publishLoad, {});
  return (
    <form action={action} className="space-y-2">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="loadId" value={loadId} />
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? c.publishing : c.publish}
      </Button>
    </form>
  );
}

/** Cancels a load after an explicit confirmation, with an optional reason. */
export function CancelLoadForm({ loadId }: { loadId: string }) {
  const [state, action, pending] = useActionState(cancelLoad, {});
  const reasonError = state.fieldErrors?.reason;
  return (
    <details className="rounded-lg border p-4 open:bg-muted/40">
      <summary className="cursor-pointer text-sm font-medium text-destructive">{c.cancel}</summary>
      <form action={action} className="mt-4 space-y-3" noValidate>
        <p className="font-medium">{c.cancelTitle}</p>
        <p className="text-sm text-muted-foreground">{c.cancelHelp}</p>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="loadId" value={loadId} />
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">{c.cancelReason}</Label>
          <textarea
            id="cancel-reason"
            name="reason"
            rows={2}
            maxLength={1000}
            aria-invalid={reasonError ? true : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
        </div>
        <Button
          type="submit"
          variant="outline"
          className="border-destructive/40 text-destructive"
          disabled={pending}
        >
          {pending ? c.cancelling : c.cancelConfirm}
        </Button>
      </form>
    </details>
  );
}
