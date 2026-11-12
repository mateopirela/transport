'use client';

import { clientListsCopy, offersCopy } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { acceptOffer, counterOffer, rejectOffer } from '@/lib/offers/actions';
import { cn } from '@/lib/utils';

const c = offersCopy.actions;
const o = clientListsCopy.offer;

/**
 * Accept, counter or reject a carrier's pending offer (§1.5): three buttons,
 * each opening a dialog that says what will happen. Accepting is the filled
 * primary when `primary` (the screen's one: the offer the client should
 * answer first); otherwise it is outlined like the rest. The RPCs re-check
 * that the offer is still pending.
 */
export function OfferResponse({
  offerId,
  amount,
  carrier,
  conditions = null,
  primary = true,
  stacked = false,
}: {
  offerId: string;
  /** Formatted amount of the offer, for the dialogs. */
  amount: string;
  carrier: string;
  /** The offer's conditions, shown in the acceptance dialog. */
  conditions?: string | null;
  /** Accept is the screen's filled primary. */
  primary?: boolean;
  /** One button under another, the whole width (the rail of a detail). */
  stacked?: boolean;
}) {
  const [accepted, accept, accepting] = useActionState(acceptOffer, {});
  const [countered, counter, countering] = useActionState(counterOffer, {});
  const [rejected, reject, rejecting] = useActionState(rejectOffer, {});
  const id = useId();
  const amountId = `${id}-amount`;
  const conditionsId = `${id}-conditions`;
  const reasonId = `${id}-reason`;
  const amountError = countered.fieldErrors?.amount;
  const conditionsError = countered.fieldErrors?.conditions;
  const reasonError = rejected.fieldErrors?.reason;
  const offer = <input type="hidden" name="offerId" value={offerId} />;

  return (
    <div className={cn('flex flex-wrap gap-2', stacked && 'flex-col [&>*]:w-full')}>
      <ConfirmDialog
        trigger={<Button variant={primary ? 'primary' : 'secondary'}>{c.accept}</Button>}
        title={c.acceptTitle}
        description={c.acceptHelp(amount, carrier)}
        confirmLabel={accepting ? c.accepting : c.acceptConfirm}
        action={accept}
        pending={accepting}
        error={accepted.error}
      >
        {offer}
        {/* What the client contracts: the offer's terms, before confirming. */}
        {conditions && (
          <div className="space-y-1 border bg-bg px-4 py-3">
            <p className="text-label text-text-dim">{offersCopy.negotiation.conditions}</p>
            <p className="text-subhead text-text">{conditions}</p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        trigger={<Button variant="secondary">{c.counter}</Button>}
        title={o.counterTitle}
        description={o.counterHelp(amount, carrier)}
        confirmLabel={countering ? c.countering : c.counterSubmit}
        action={counter}
        pending={countering}
        error={countered.error}
      >
        {offer}
        <Field label={c.counterAmount} htmlFor={amountId} error={amountError}>
          <Input
            id={amountId}
            name="amount"
            inputMode="decimal"
            defaultValue={countered.values?.amount}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? fieldHelpId(amountId) : undefined}
            className="tabular-nums"
          />
        </Field>
        <Field label={c.counterConditions} htmlFor={conditionsId} error={conditionsError}>
          <Textarea
            id={conditionsId}
            name="conditions"
            rows={2}
            maxLength={1000}
            defaultValue={countered.values?.conditions}
            aria-invalid={conditionsError ? true : undefined}
            aria-describedby={conditionsError ? fieldHelpId(conditionsId) : undefined}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        trigger={<Button variant="destructive">{c.reject}</Button>}
        title={o.rejectTitle}
        description={o.rejectHelp(carrier)}
        confirmLabel={rejecting ? c.rejecting : c.rejectConfirm}
        destructive
        action={reject}
        pending={rejecting}
        error={rejected.error}
      >
        {offer}
        <Field label={c.rejectReason} htmlFor={reasonId} error={reasonError}>
          <Textarea
            id={reasonId}
            name="reason"
            rows={2}
            maxLength={1000}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? fieldHelpId(reasonId) : undefined}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
