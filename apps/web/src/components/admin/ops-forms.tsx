'use client';

import { adminOpsCopy, type OfferSide } from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { adminAcceptOffer, adminCreateOffer, resolveIncident } from '@/lib/admin/actions';

/** `aria-describedby` of a control whose field shows an error. */
function describedBy(id: string, error?: string) {
  return error ? fieldHelpId(id) : undefined;
}

/**
 * Manual contract: an offer in the name of a carrier, optionally accepted at
 * once. The only primary of the load's screen.
 */
export function ContractForm({
  loadId,
  carriers,
}: {
  loadId: string;
  carriers: { id: string; legal_name: string }[];
}) {
  const c = adminOpsCopy.contract;
  const [state, action, pending] = useActionState(adminCreateOffer, {});
  const errors = state.fieldErrors ?? {};
  if (carriers.length === 0) return <Notice tone="info">{c.noCarriers}</Notice>;
  return (
    <form action={action} className="space-y-4 rounded-2xl border bg-cell p-5" noValidate>
      <div className="space-y-1">
        <h2 className="text-headline text-text">{c.title}</h2>
        <p className="text-subhead text-text-dim">{c.help}</p>
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <input type="hidden" name="loadId" value={loadId} />
      <Field label={c.carrier} htmlFor="contract-carrier" error={errors.carrierCompanyId}>
        <Select
          id="contract-carrier"
          name="carrierCompanyId"
          defaultValue={state.values?.carrierCompanyId ?? ''}
          aria-invalid={errors.carrierCompanyId ? true : undefined}
          aria-describedby={describedBy('contract-carrier', errors.carrierCompanyId)}
        >
          <option value="" disabled />
          {carriers.map((carrier) => (
            <option key={carrier.id} value={carrier.id}>
              {carrier.legal_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={c.amount} htmlFor="contract-amount" error={errors.amount}>
        <Input
          id="contract-amount"
          name="amount"
          inputMode="decimal"
          defaultValue={state.values?.amount}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={describedBy('contract-amount', errors.amount)}
        />
      </Field>
      <Field label={c.conditions} htmlFor="contract-conditions" error={errors.conditions}>
        <Textarea
          id="contract-conditions"
          name="conditions"
          rows={2}
          maxLength={1000}
          defaultValue={state.values?.conditions}
          aria-invalid={errors.conditions ? true : undefined}
          aria-describedby={describedBy('contract-conditions', errors.conditions)}
        />
      </Field>
      <label className="flex items-center gap-2.5 px-1 text-subhead text-text">
        <input
          type="checkbox"
          name="accept"
          defaultChecked={state.values?.accept === 'on'}
          className="size-4 accent-accent"
        />
        {c.accept}
      </label>
      <Button type="submit" variant="primary" loading={pending} className="w-full">
        {pending ? c.pending : c.submit}
      </Button>
    </form>
  );
}

/** Accepts a pending offer in the name of its counterparty, after a confirmation. */
export function AcceptOfferForm({ offerId, side }: { offerId: string; side: OfferSide }) {
  const c = adminOpsCopy.load;
  const [state, action, pending] = useActionState(adminAcceptOffer, {});
  return (
    <Disclosure
      summary={c.acceptFor(side)}
      look="inline"
      tone="accent"
      open={Boolean(state.error)}
      className="max-w-xs"
    >
      <form action={action} className="space-y-3">
        <p className="text-subhead text-text-dim">{c.acceptConfirm}</p>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="offerId" value={offerId} />
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          {pending ? c.accepting : c.acceptFor(side)}
        </Button>
      </form>
    </Disclosure>
  );
}

/** Resolves an open incident with a resolution note. */
export function ResolveIncidentForm({ incidentId }: { incidentId: string }) {
  const c = adminOpsCopy.incidents;
  const [state, action, pending] = useActionState(resolveIncident, {});
  const id = `resolution-${incidentId}`;
  const error = state.fieldErrors?.resolution;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="max-w-xl space-y-3" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="incidentId" value={incidentId} />
      <Field label={c.resolution} htmlFor={id} error={error}>
        <Textarea
          id={id}
          name="resolution"
          rows={2}
          maxLength={2000}
          defaultValue={state.values?.resolution}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error)}
          className="min-h-20"
        />
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        {pending ? c.resolving : c.resolve}
      </Button>
    </form>
  );
}
