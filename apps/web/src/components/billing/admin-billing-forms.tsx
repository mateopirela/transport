'use client';

import {
  adminBillingCopy,
  billingEnforcementLabels,
  type BillingEnforcement,
  centsToPesosInput,
  toMexicoCityDate,
} from '@transport/shared';
import { useActionState, useId, useState } from 'react';

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

/** Ends or resumes the pilot, folded behind a confirmation. */
export function PilotModeForm({ pilotMode }: { pilotMode: boolean }) {
  const [state, action, pending] = useActionState(setPilotModeAction, {});
  return (
    <Disclosure
      summary={pilotMode ? c.endPilot : c.resumePilot}
      look="inline"
      tone={pilotMode ? 'red' : 'accent'}
      open={Boolean(state.error)}
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="pilotMode" value={pilotMode ? 'false' : 'true'} />
        {pilotMode && (
          <div className="space-y-0.5">
            <p className="text-headline text-text">{c.endPilotConfirmTitle}</p>
            <p className="text-subhead text-text-dim">{c.endPilotConfirmBody}</p>
          </div>
        )}
        <StateNotice state={state} />
        <Button
          type="submit"
          variant={pilotMode ? 'destructive' : 'secondary'}
          size="sm"
          loading={pending}
        >
          {pilotMode ? c.confirm : c.resumePilot}
        </Button>
      </form>
    </Disclosure>
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
          <Label htmlFor={`${id}-date`} className="block px-1">
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
      <p className="px-1 text-footnote text-text-dim">{c.pilotEndsAtHelp}</p>
      <StateNotice state={state} />
    </form>
  );
}

/** What happens without an active subscription after the pilot; block asks first. */
export function EnforcementForm({ enforcement }: { enforcement: BillingEnforcement }) {
  const id = useId();
  const [state, action, pending] = useActionState(setEnforcementAction, {});
  const [choice, setChoice] = useState<BillingEnforcement>(enforcement);
  const confirming = choice === 'block' && enforcement !== 'block';
  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-72 flex-1 space-y-1.5">
          <Label htmlFor={`${id}-mode`} className="block px-1">
            {c.enforcement}
          </Label>
          <Select
            id={`${id}-mode`}
            name="enforcement"
            value={choice}
            onChange={(event) => setChoice(event.target.value as BillingEnforcement)}
          >
            {(Object.keys(billingEnforcementLabels) as BillingEnforcement[]).map((value) => (
              <option key={value} value={value}>
                {billingEnforcementLabels[value]}
              </option>
            ))}
          </Select>
        </div>
        {!confirming && (
          <Button type="submit" variant="secondary" loading={pending}>
            {c.saveEnforcement}
          </Button>
        )}
      </div>
      {confirming && (
        <div className="space-y-3 rounded-2xl bg-red/14 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-headline text-red-text">{c.blockConfirmTitle}</p>
            <p className="text-subhead text-text">{c.blockConfirmBody}</p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" loading={pending}>
              {c.confirm}
            </Button>
            <Button type="button" variant="plain" size="sm" onClick={() => setChoice(enforcement)}>
              {c.cancel}
            </Button>
          </div>
        </div>
      )}
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
            <Label htmlFor={`${id}-name`} className="block px-1">
              {c.planName}
            </Label>
            <Input id={`${id}-name`} name="name" defaultValue={plan.name} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-price`} className="block px-1">
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
            <Label htmlFor={`${id}-description`} className="block px-1">
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
            <Label htmlFor={`${id}-stripe`} className="block px-1">
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
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {c.savePlan}
        </Button>
      </form>
    </Disclosure>
  );
}
