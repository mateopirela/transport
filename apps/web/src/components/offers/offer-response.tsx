'use client';

import { offersCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Disclosure } from '@/components/disclosure';
import { Button } from '@/components/ui/button';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { acceptOffer, counterOffer, rejectOffer } from '@/lib/offers/actions';

const c = offersCopy.actions;

/**
 * Accept (after an explicit confirmation), counter or reject a carrier's
 * pending offer, each folded in its cell. Confirming the acceptance is the
 * screen's one primary. The RPCs re-check that the offer is still pending.
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
      <Disclosure summary={c.accept} tone="ok">
        <form action={accept} className="space-y-4">
          <div className="space-y-1">
            <p className="text-headline text-text">{c.acceptTitle}</p>
            <p className="text-subhead text-text-dim">{c.acceptHelp(amount, carrier)}</p>
          </div>
          {accepted.error && <Notice tone="error">{accepted.error}</Notice>}
          <input type="hidden" name="offerId" value={offerId} />
          <Button type="submit" className="w-full" disabled={accepting} loading={accepting}>
            {accepting ? c.accepting : c.acceptConfirm}
          </Button>
        </form>
      </Disclosure>

      <Disclosure summary={c.counter} open={Boolean(countered.error || amountError)}>
        <form action={counter} className="space-y-4" noValidate>
          {countered.error && <Notice tone="error">{countered.error}</Notice>}
          <input type="hidden" name="offerId" value={offerId} />
          <Field label={c.counterAmount} htmlFor="counter-amount" error={amountError}>
            <Input
              id="counter-amount"
              name="amount"
              inputMode="decimal"
              defaultValue={countered.values?.amount}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? fieldHelpId('counter-amount') : undefined}
              className="tabular-nums"
            />
          </Field>
          <Field label={c.counterConditions} htmlFor="counter-conditions" error={conditionsError}>
            <Textarea
              id="counter-conditions"
              name="conditions"
              rows={2}
              maxLength={1000}
              defaultValue={countered.values?.conditions}
              aria-invalid={conditionsError ? true : undefined}
              aria-describedby={conditionsError ? fieldHelpId('counter-conditions') : undefined}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={countering}
            loading={countering}
          >
            {countering ? c.countering : c.counterSubmit}
          </Button>
        </form>
      </Disclosure>

      <Disclosure summary={c.reject} tone="red">
        <form action={reject} className="space-y-4" noValidate>
          {rejected.error && <Notice tone="error">{rejected.error}</Notice>}
          <input type="hidden" name="offerId" value={offerId} />
          <Field label={c.rejectReason} htmlFor="reject-reason" error={reasonError}>
            <Textarea
              id="reject-reason"
              name="reason"
              rows={2}
              maxLength={1000}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? fieldHelpId('reject-reason') : undefined}
            />
          </Field>
          <Button
            type="submit"
            variant="destructive"
            className="w-full"
            disabled={rejecting}
            loading={rejecting}
          >
            {rejecting ? c.rejecting : c.rejectConfirm}
          </Button>
        </form>
      </Disclosure>
    </div>
  );
}
