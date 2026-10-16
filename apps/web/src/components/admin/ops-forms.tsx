'use client';

import { adminOpsCopy, type OfferSide } from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminAcceptOffer, adminCreateOffer, resolveIncident } from '@/lib/admin/actions';

const textarea = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const select = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

/** Manual contract: an offer in the name of a carrier, optionally accepted at once. */
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
  if (carriers.length === 0) return <p className="text-sm text-muted-foreground">{c.noCarriers}</p>;
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-card p-4" noValidate>
      <p className="font-medium">{c.title}</p>
      <p className="text-sm text-muted-foreground">{c.help}</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <input type="hidden" name="loadId" value={loadId} />
      <div className="space-y-1.5">
        <Label htmlFor="contract-carrier">{c.carrier}</Label>
        <select
          id="contract-carrier"
          name="carrierCompanyId"
          defaultValue={state.values?.carrierCompanyId ?? ''}
          aria-invalid={errors.carrierCompanyId ? true : undefined}
          className={select}
        >
          <option value="" disabled />
          {carriers.map((carrier) => (
            <option key={carrier.id} value={carrier.id}>
              {carrier.legal_name}
            </option>
          ))}
        </select>
        <FieldError message={errors.carrierCompanyId} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contract-amount">{c.amount}</Label>
        <Input
          id="contract-amount"
          name="amount"
          inputMode="decimal"
          defaultValue={state.values?.amount}
          aria-invalid={errors.amount ? true : undefined}
        />
        <FieldError message={errors.amount} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contract-conditions">{c.conditions}</Label>
        <textarea
          id="contract-conditions"
          name="conditions"
          rows={2}
          maxLength={1000}
          defaultValue={state.values?.conditions}
          aria-invalid={errors.conditions ? true : undefined}
          className={textarea}
        />
        <FieldError message={errors.conditions} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="accept" defaultChecked={state.values?.accept === 'on'} />
        {c.accept}
      </label>
      <Button type="submit" variant="accent" disabled={pending}>
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
    <details className="text-sm">
      <summary className="cursor-pointer text-accent">{c.acceptFor(side)}</summary>
      <form action={action} className="mt-2 max-w-sm space-y-2">
        <p className="text-muted-foreground">{c.acceptConfirm}</p>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="offerId" value={offerId} />
        <Button type="submit" size="sm" variant="accent" disabled={pending}>
          {pending ? c.accepting : c.acceptFor(side)}
        </Button>
      </form>
    </details>
  );
}

/** Resolves an open incident with a resolution note. */
export function ResolveIncidentForm({ incidentId }: { incidentId: string }) {
  const c = adminOpsCopy.incidents;
  const [state, action, pending] = useActionState(resolveIncident, {});
  const id = `resolution-${incidentId}`;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-2" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="incidentId" value={incidentId} />
      <Label htmlFor={id}>{c.resolution}</Label>
      <textarea
        id={id}
        name="resolution"
        rows={2}
        maxLength={2000}
        defaultValue={state.values?.resolution}
        aria-invalid={state.fieldErrors?.resolution ? true : undefined}
        className={textarea}
      />
      <FieldError message={state.fieldErrors?.resolution} />
      <Button type="submit" size="sm" variant="accent" disabled={pending}>
        {pending ? c.resolving : c.resolve}
      </Button>
    </form>
  );
}
