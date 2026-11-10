'use client';

import { brokeredCopy, centsToPesosInput } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { quoteBrokeredLoadAction, respondBrokeredOfferAction } from '@/lib/brokered/actions';
import type { FormState } from '@/lib/forms';

const c = brokeredCopy.admin;

function StateNotice({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

const priceText = (cents: number | null) => (cents === null ? '' : centsToPesosInput(cents));

/**
 * The prices of a brokered load (I6): the client's price and the carriers'
 * rate. Once the client approved its price, only the rate can change.
 */
export function QuoteForm({
  loadId,
  clientPriceCents,
  carrierPriceCents,
  clientApproved,
}: {
  loadId: string;
  clientPriceCents: number | null;
  carrierPriceCents: number | null;
  clientApproved: boolean;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(quoteBrokeredLoadAction, {});
  return (
    <form action={action} className="space-y-3" noValidate>
      <StateNotice state={state} />
      <input type="hidden" name="loadId" value={loadId} />
      {/* An approved price is sent as it is: the RPC refuses a change. */}
      {clientApproved && (
        <input type="hidden" name="clientPrice" value={priceText(clientPriceCents)} />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-client`} className="block px-1">
            {c.clientPrice}
          </Label>
          <Input
            id={`${id}-client`}
            name={clientApproved ? undefined : 'clientPrice'}
            inputMode="decimal"
            autoComplete="off"
            disabled={clientApproved}
            defaultValue={state.values?.clientPrice ?? priceText(clientPriceCents)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-carrier`} className="block px-1">
            {c.carrierPrice}
          </Label>
          <Input
            id={`${id}-carrier`}
            name="carrierPrice"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={state.values?.carrierPrice ?? priceText(carrierPriceCents)}
          />
        </div>
      </div>
      <p className="px-1 text-footnote text-text-dim">{c.quoteHelp}</p>
      <Button type="submit" loading={pending}>
        {pending ? c.saving : clientApproved ? c.updateRate : c.quote}
      </Button>
    </form>
  );
}

/**
 * Transport's answer to a carrier's pending offer on a brokered load:
 * accept, reject or counter (never over the client's price).
 */
export function OfferResponseForm({ loadId, offerId }: { loadId: string; offerId: string }) {
  const id = useId();
  const [state, action, pending] = useActionState(respondBrokeredOfferAction, {});
  return (
    <div className="space-y-2">
      <StateNotice state={state} />
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="loadId" value={loadId} />
        <input type="hidden" name="offerId" value={offerId} />
        <Button type="submit" name="intent" value="accept" size="sm" loading={pending}>
          {c.accept}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="reject"
          size="sm"
          variant="secondary"
          disabled={pending}
        >
          {c.reject}
        </Button>
      </form>
      <Disclosure summary={c.counter} look="inline" tone="accent" className="max-w-sm">
        <form action={action} className="mt-2 space-y-2" noValidate>
          <input type="hidden" name="loadId" value={loadId} />
          <input type="hidden" name="offerId" value={offerId} />
          <input type="hidden" name="intent" value="counter" />
          <Label htmlFor={`${id}-amount`} className="block px-1">
            {c.counterAmount}
          </Label>
          <Input
            id={`${id}-amount`}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={state.values?.amount}
          />
          <Button type="submit" size="sm" variant="secondary" loading={pending}>
            {c.send}
          </Button>
        </form>
      </Disclosure>
    </div>
  );
}
