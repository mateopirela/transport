'use client';

import { sharedDocumentsCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { revokeDocumentShare } from '@/lib/shared-documents/actions';

const c = sharedDocumentsCopy.carrier;

/** The manager stops sharing one document with the trip's shipper (G6). */
export function RevokeShareButton({ shareId }: { shareId: string }) {
  const [state, action, pending] = useActionState(revokeDocumentShare, {});
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(c.revokeConfirm)) event.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="shareId" value={shareId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending} loading={pending}>
        {c.revoke}
      </Button>
      {state.error && (
        <p className="text-footnote text-red-text" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
