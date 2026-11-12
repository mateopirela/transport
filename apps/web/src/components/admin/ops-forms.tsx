'use client';

import { adminOpsCopy, adminPanelCopy, type OfferSide } from '@transport/shared';
import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { adminAcceptOffer, adminCreateOffer, resolveIncident } from '@/lib/admin/actions';
import type { FormState } from '@/lib/forms';

import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { formAmount, formText } from '@/lib/admin/confirm-text';

const k = adminPanelCopy.confirm;

/** `aria-describedby` of a control whose field shows an error. */
function describedBy(id: string, error?: string) {
  return error ? fieldHelpId(id) : undefined;
}

/**
 * Manual contract: an offer in the name of a carrier, optionally accepted at
 * once. The only primary of the load's screen, in its rail; it asks first,
 * saying whether the load will be contracted.
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
  const carrierName = (id: string) => carriers.find((carrier) => carrier.id === id)?.legal_name;
  return (
    <form action={action} className="space-y-4" noValidate>
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
          className="min-h-16"
          defaultValue={state.values?.conditions}
          aria-invalid={errors.conditions ? true : undefined}
          aria-describedby={describedBy('contract-conditions', errors.conditions)}
        />
      </Field>
      <label className="flex items-start gap-2.5 text-subhead text-text">
        <input
          type="checkbox"
          name="accept"
          defaultChecked={state.values?.accept === 'on'}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        {c.accept}
      </label>
      <ConfirmSubmit
        variant="primary"
        className="w-full"
        loading={pending}
        title={k.contract.title}
        confirmLabel={k.contract.confirm}
        // Nothing to confirm while a field is missing: the server says which.
        skip={(data) =>
          !carrierName(formText(data, 'carrierCompanyId')) || !formAmount(data, 'amount')
        }
        description={(data) => {
          const carrier = carrierName(formText(data, 'carrierCompanyId')) ?? '';
          const amount = formAmount(data, 'amount') ?? '';
          return data.get('accept') === 'on'
            ? k.contract.bodyAccept(carrier, amount)
            : k.contract.body(carrier, amount);
        }}
      >
        {pending ? c.pending : c.submit}
      </ConfirmSubmit>
      <p className="text-footnote text-text-dim">{c.help}</p>
    </form>
  );
}

/** Accepts a pending offer in the name of its counterparty, after a confirmation. */
export function AcceptOfferForm({ offerId, side }: { offerId: string; side: OfferSide }) {
  const c = adminOpsCopy.load;
  const [state, action, pending] = useActionState(adminAcceptOffer, {});
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm" variant="secondary">
          {c.acceptFor(side)}
        </Button>
      }
      title={k.acceptOffer.title}
      description={c.acceptConfirm}
      confirmLabel={pending ? c.accepting : k.acceptOffer.confirm}
      action={action}
      pending={pending}
      error={state.error}
    >
      <input type="hidden" name="offerId" value={offerId} />
    </ConfirmDialog>
  );
}

/** Resolves an open incident: a dialog that says what happens and takes the resolution. */
export function ResolveIncidentForm({ incidentId }: { incidentId: string }) {
  const c = adminOpsCopy.incidents;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData): Promise<FormState> => {
      const next = await resolveIncident(previous, data);
      // Resolved: the dialog closes and the row leaves the open incidents.
      if (next.message) setOpen(false);
      return next;
    },
    {},
  );
  const id = `resolution-${incidentId}`;
  const error = state.fieldErrors?.resolution;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" size="sm" variant="secondary">
          {c.resolve}
        </Button>
      }
      title={k.resolveIncident.title}
      description={k.resolveIncident.body}
      confirmLabel={pending ? c.resolving : k.resolveIncident.confirm}
      action={action}
      pending={pending}
      error={state.error}
    >
      <input type="hidden" name="incidentId" value={incidentId} />
      <Field label={c.resolution} htmlFor={id} error={error}>
        <Textarea
          id={id}
          name="resolution"
          rows={3}
          maxLength={2000}
          defaultValue={state.values?.resolution}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error)}
          className="min-h-20"
        />
      </Field>
    </ConfirmDialog>
  );
}
