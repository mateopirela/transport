'use client';

import { offersCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptOffer, counterOffer, rejectOffer } from '@/lib/offers/actions';

const c = offersCopy.actions;
const textarea = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/**
 * Accept (after an explicit confirmation), counter or reject a carrier's
 * pending offer. The RPCs re-check that the offer is still pending.
 */
export function OfferResponse({
  offerId,
  amount,
  carrier,
}: {
  offerId: string;
  /** Formatted amount of the offer, for the confirmation. */
  amount: string;
  carrier: string;
}) {
  const [accepted, accept, accepting] = useActionState(acceptOffer, {});
  const [countered, counter, countering] = useActionState(counterOffer, {});
  const [rejected, reject, rejecting] = useActionState(rejectOffer, {});
  const amountError = countered.fieldErrors?.amount;
  const conditionsError = countered.fieldErrors?.conditions;
  const reasonError = rejected.fieldErrors?.reason;

  return (
    <div className="space-y-3">
      <details className="rounded-lg border p-4 open:bg-muted/40">
        <summary className="cursor-pointer text-sm font-medium text-success">{c.accept}</summary>
        <form action={accept} className="mt-4 space-y-3">
          <p className="font-medium">{c.acceptTitle}</p>
          <p className="text-sm text-muted-foreground">{c.acceptHelp(amount, carrier)}</p>
          {accepted.error && <Notice tone="error">{accepted.error}</Notice>}
          <input type="hidden" name="offerId" value={offerId} />
          <Button type="submit" variant="accent" disabled={accepting}>
            {accepting ? c.accepting : c.acceptConfirm}
          </Button>
        </form>
      </details>

      <details
        className="rounded-lg border p-4 open:bg-muted/40"
        open={Boolean(countered.error || amountError)}
      >
        <summary className="cursor-pointer text-sm font-medium">{c.counter}</summary>
        <form action={counter} className="mt-4 space-y-3" noValidate>
          {countered.error && <Notice tone="error">{countered.error}</Notice>}
          <input type="hidden" name="offerId" value={offerId} />
          <div className="space-y-1.5">
            <Label htmlFor="counter-amount">{c.counterAmount}</Label>
            <Input
              id="counter-amount"
              name="amount"
              inputMode="decimal"
              defaultValue={countered.values?.amount}
              aria-invalid={amountError ? true : undefined}
            />
            {amountError && <p className="text-xs text-destructive">{amountError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="counter-conditions">{c.counterConditions}</Label>
            <textarea
              id="counter-conditions"
              name="conditions"
              rows={2}
              maxLength={1000}
              defaultValue={countered.values?.conditions}
              aria-invalid={conditionsError ? true : undefined}
              className={textarea}
            />
            {conditionsError && <p className="text-xs text-destructive">{conditionsError}</p>}
          </div>
          <Button type="submit" disabled={countering}>
            {countering ? c.countering : c.counterSubmit}
          </Button>
        </form>
      </details>

      <details className="rounded-lg border p-4 open:bg-muted/40">
        <summary className="cursor-pointer text-sm font-medium text-destructive">
          {c.reject}
        </summary>
        <form action={reject} className="mt-4 space-y-3" noValidate>
          {rejected.error && <Notice tone="error">{rejected.error}</Notice>}
          <input type="hidden" name="offerId" value={offerId} />
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">{c.rejectReason}</Label>
            <textarea
              id="reject-reason"
              name="reason"
              rows={2}
              maxLength={1000}
              aria-invalid={reasonError ? true : undefined}
              className={textarea}
            />
            {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
          </div>
          <Button
            type="submit"
            variant="outline"
            className="border-destructive/40 text-destructive"
            disabled={rejecting}
          >
            {rejecting ? c.rejecting : c.rejectConfirm}
          </Button>
        </form>
      </details>
    </div>
  );
}
