'use client';

import { brokeredCopy, formatMoney } from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { approveBrokeredQuote } from '@/lib/loads/actions';

const c = brokeredCopy.shipper;

/**
 * Accepts the price Transport quoted (I6): the primary of a quoted brokered
 * load. It sends the price on screen, so a price changed meanwhile is refused.
 */
export function ApproveQuoteButton({ loadId, priceCents }: { loadId: string; priceCents: number }) {
  const [state, action, pending] = useActionState(approveBrokeredQuote, {});
  return (
    <form action={action} className="space-y-2">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="loadId" value={loadId} />
      <input type="hidden" name="priceCents" value={priceCents} />
      <Button type="submit" className="w-full" disabled={pending} loading={pending}>
        {pending ? c.approving : c.approve(formatMoney(priceCents))}
      </Button>
    </form>
  );
}
