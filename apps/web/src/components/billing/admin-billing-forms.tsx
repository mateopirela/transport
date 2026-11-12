'use client';

import {
  adminBillingCopy,
  adminPanelCopy,
  billingEnforcementLabels,
  type BillingEnforcement,
  centsToPesosInput,
  toMexicoCityDate,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  setEnforcementAction,
  setPilotEndAction,
  setPilotModeAction,
  updatePlanAction,
} from '@/lib/billing/actions';
import type { SubscriptionPlan } from '@/lib/billing/queries';
import type { FormState } from '@/lib/forms';

const c = adminBillingCopy;

function StateNotice({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/** Ends or resumes the pilot, after a dialog that says what changes. */
export function PilotModeForm({ pilotMode }: { pilotMode: boolean }) {
  const [state, action, pending] = useActionState(setPilotModeAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="pilotMode" value={pilotMode ? 'false' : 'true'} />
      <StateNotice state={state} />
      <ConfirmSubmit
        variant={pilotMode ? 'destructive' : 'secondary'}
        destructive={pilotMode}
        loading={pending}
        title={pilotMode ? c.endPilotConfirmTitle : adminPanelCopy.confirm.resumePilot.title}
        description={pilotMode ? c.endPilotConfirmBody : adminPanelCopy.confirm.resumePilot.body}
        confirmLabel={pilotMode ? c.endPilot : c.resumePilot}
      >
        {pilotMode ? c.endPilot : c.resumePilot}
      </ConfirmSubmit>
    </form>
  );
}

/** The end date of the pilot (only for the notices), or none. */
export function PilotEndForm({ pilotEndsAt }: { pilotEndsAt: string | null }) {
  const id = useId();
  const [state, action, pending] = useActionState(setPilotEndAction, {});
  return (
    <form action={action} className="space-y-2" noValidate>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 space-y-1.5">
          <Label htmlFor={`${id}-date`} className="block">
            {c.pilotEndsAt}
          </Label>
          <Input
            id={`${id}-date`}
            name="pilotEndsAt"
            type="date"
            defaultValue={pilotEndsAt ? toMexicoCityDate(pilotEndsAt) : ''}
          />
        </div>
        <Button type="submit" variant="secondary" loading={pending}>
          {c.saveDate}
        </Button>
        {pilotEndsAt && (
          <Button type="submit" name="clear" value="on" variant="plain" disabled={pending}>
            {c.clearDate}
          </Button>
        )}
      </div>
      <p className="text-footnote text-text-dim">{c.pilotEndsAtHelp}</p>
      <StateNotice state={state} />
    </form>
  );
}

/** What happens without an active subscription after the pilot; block asks first. */
export function EnforcementForm({ enforcement }: { enforcement: BillingEnforcement }) {
  const id = useId();
  const [state, action, pending] = useActionState(setEnforcementAction, {});
  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-72 flex-1 space-y-2">
          <Label htmlFor={`${id}-mode`} className="block">
            {c.enforcement}
          </Label>
          <Select id={`${id}-mode`} name="enforcement" defaultValue={enforcement}>
            {(Object.keys(billingEnforcementLabels) as BillingEnforcement[]).map((value) => (
              <option key={value} value={value}>
                {billingEnforcementLabels[value]}
              </option>
            ))}
          </Select>
        </div>
        <ConfirmSubmit
          loading={pending}
          title={c.blockConfirmTitle}
          description={c.blockConfirmBody}
          confirmLabel={c.confirm}
          destructive
          // Only switching the block on asks first: the other modes stop nothing.
          skip={(data) => data.get('enforcement') !== 'block' || enforcement === 'block'}
        >
          {c.saveEnforcement}
        </ConfirmSubmit>
      </div>
      <StateNotice state={state} />
    </form>
  );
}

/** Edits one plan: name, description, monthly price, Stripe price and active. */
export function PlanForm({ plan }: { plan: SubscriptionPlan }) {
  const id = useId();
  const [state, action, pending] = useActionState(updatePlanAction, {});
  return (
    <Disclosure summary={plan.name} look="row" open={Boolean(state.error)}>
      <form action={action} className="space-y-3" noValidate>
        <input type="hidden" name="planId" value={plan.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`} className="block">
              {c.planName}
            </Label>
            <Input id={`${id}-name`} name="name" defaultValue={plan.name} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-price`} className="block">
              {c.planPrice}
            </Label>
            <Input
              id={`${id}-price`}
              name="price"
              inputMode="decimal"
              placeholder={c.planPriceHelp}
              defaultValue={plan.amount_cents === null ? '' : centsToPesosInput(plan.amount_cents)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-description`} className="block">
              {c.planDescription}
            </Label>
            <Textarea
              id={`${id}-description`}
              name="description"
              maxLength={500}
              defaultValue={plan.description ?? ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-stripe`} className="block">
              {c.planStripePrice}
            </Label>
            <Input
              id={`${id}-stripe`}
              name="stripePriceId"
              defaultValue={plan.stripe_price_id ?? ''}
              maxLength={120}
              autoComplete="off"
            />
          </div>
          <label className="flex items-center gap-2.5 self-end px-1 pb-3 text-subhead text-text">
            <input
              type="checkbox"
              name="active"
              defaultChecked={plan.active}
              className="size-4 accent-accent"
            />
            {c.planActive}
          </label>
        </div>
        <StateNotice state={state} />
        <ConfirmSubmit
          size="sm"
          loading={pending}
          title={adminPanelCopy.confirm.plan.title}
          description={adminPanelCopy.confirm.plan.body}
          confirmLabel={adminPanelCopy.confirm.plan.confirm}
        >
          {c.savePlan}
        </ConfirmSubmit>
      </form>
    </Disclosure>
  );
}
