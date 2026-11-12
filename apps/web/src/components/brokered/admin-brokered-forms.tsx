'use client';

import { adminPanelCopy, brokeredCopy, centsToPesosInput } from '@transport/shared';
import { useActionState, useId } from 'react';

import { ConfirmSubmit, formAmount } from '@/components/admin/confirm-submit';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { quoteBrokeredLoadAction, respondBrokeredOfferAction } from '@/lib/brokered/actions';
import type { FormState } from '@/lib/forms';

const c = brokeredCopy.admin;
const k = adminPanelCopy.confirm;

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
          <Label htmlFor={`${id}-client`} className="block">
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
          <Label htmlFor={`${id}-carrier`} className="block">
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
      <p className="text-footnote text-text-dim">{c.quoteHelp}</p>
      <ConfirmSubmit
        variant="primary"
        loading={pending}
        title={k.quote.title}
        confirmLabel={k.quote.confirm}
        // A price that is not one goes to the server, which says which field.
        skip={(data) => !formAmount(data, 'clientPrice') || !formAmount(data, 'carrierPrice')}
        description={(data) =>
          k.quote.body(
            formAmount(data, 'clientPrice') ?? '',
            formAmount(data, 'carrierPrice') ?? '',
          )
        }
      >
        {pending ? c.saving : clientApproved ? c.updateRate : c.quote}
      </ConfirmSubmit>
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
      <form action={action} className="flex flex-wrap justify-end gap-2">
        <input type="hidden" name="loadId" value={loadId} />
        <input type="hidden" name="offerId" value={offerId} />
        <ConfirmSubmit
          name="intent"
          value="accept"
          size="sm"
          loading={pending}
          title={k.acceptBrokeredOffer.title}
          description={k.acceptBrokeredOffer.body}
          confirmLabel={k.acceptBrokeredOffer.confirm}
        >
          {c.accept}
        </ConfirmSubmit>
        <ConfirmSubmit
          name="intent"
          value="reject"
          size="sm"
          variant="destructive"
          destructive
          disabled={pending}
          title={k.rejectBrokeredOffer.title}
          description={k.rejectBrokeredOffer.body}
          confirmLabel={k.rejectBrokeredOffer.confirm}
        >
          {c.reject}
        </ConfirmSubmit>
      </form>
      <Disclosure summary={c.counter} look="inline" tone="accent" className="ml-auto max-w-sm">
        <form action={action} className="mt-2 space-y-2 text-left" noValidate>
          <input type="hidden" name="loadId" value={loadId} />
          <input type="hidden" name="offerId" value={offerId} />
          <input type="hidden" name="intent" value="counter" />
          <Label htmlFor={`${id}-amount`} className="block">
            {c.counterAmount}
          </Label>
          <Input
            id={`${id}-amount`}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={state.values?.amount}
          />
          <ConfirmSubmit
            size="sm"
            loading={pending}
            title={k.counterBrokeredOffer.title}
            confirmLabel={k.counterBrokeredOffer.confirm}
            skip={(data) => !formAmount(data, 'amount')}
            description={(data) => k.counterBrokeredOffer.body(formAmount(data, 'amount') ?? '')}
          >
            {c.send}
          </ConfirmSubmit>
        </form>
      </Disclosure>
    </div>
  );
}
