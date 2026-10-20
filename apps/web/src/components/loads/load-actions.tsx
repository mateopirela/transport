'use client';

import { loadsCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Disclosure } from '@/components/ui/disclosure';
import { Button } from '@/components/ui/button';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { cancelLoad, publishLoad } from '@/lib/loads/actions';

const c = loadsCopy.actions;

/** Publishes a draft: the primary of a draft's screen. */
export function PublishLoadButton({ loadId }: { loadId: string }) {
  const [state, action, pending] = useActionState(publishLoad, {});
  return (
    <form action={action} className="space-y-2">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="loadId" value={loadId} />
      <Button type="submit" className="w-full" disabled={pending} loading={pending}>
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
    <Disclosure look="cell" summary={c.cancel} tone="red">
      <form action={action} className="space-y-4" noValidate>
        <div className="space-y-1">
          <p className="text-headline text-text">{c.cancelTitle}</p>
          <p className="text-subhead text-text-dim">{c.cancelHelp}</p>
        </div>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="loadId" value={loadId} />
        <Field label={c.cancelReason} htmlFor="cancel-reason" error={reasonError}>
          <Textarea
            id="cancel-reason"
            name="reason"
            rows={2}
            maxLength={1000}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? fieldHelpId('cancel-reason') : undefined}
          />
        </Field>
        <Button type="submit" variant="destructive" disabled={pending} loading={pending}>
          {pending ? c.cancelling : c.cancelConfirm}
        </Button>
      </form>
    </Disclosure>
  );
}
