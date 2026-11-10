'use client';

import { formatBasisPoints, formatMxn, quickPayCopy, quickPaySplit } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import type { FormState } from '@/lib/forms';
import {
  approveQuickPayAction,
  rejectQuickPayAction,
  requestQuickPayAction,
  setQuickPaySettingsAction,
} from '@/lib/freight/quick-pay-actions';

// Quick pay (I4, D38): the carrier's request in Cobranza, and the admin's
// decision and settings in /admin/flete. Postgres checks every rule again.

const q = quickPayCopy;

function StateNotice({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * "Pedir pago rápido" of a trip (carrier): the fee and the quick net shown
 * before confirming. The fee goes with the request, so a fee changed in
 * between is refused instead of charged.
 */
export function QuickPayRequest({
  tripId,
  netCents,
  feeBps,
}: {
  tripId: string;
  netCents: number;
  feeBps: number;
}) {
  const [state, action, pending] = useActionState(requestQuickPayAction, {});
  const split = quickPaySplit(netCents, feeBps);
  return (
    <Disclosure summary={q.carrier.request} look="inline" tone="accent" open={Boolean(state.error)}>
      <form
        action={action}
        className="mt-2 space-y-2"
        data-testid={`quick-pay-request-${tripId}`}
        noValidate
      >
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="feeBps" value={feeBps} />
        <p className="text-footnote text-text-dim">{q.carrier.help}</p>
        <dl className="space-y-0.5 text-subhead">
          <div className="flex justify-between gap-3">
            <dt className="text-text-dim">{q.carrier.fee(formatBasisPoints(feeBps))}</dt>
            <dd className="text-text tabular-nums" data-testid="quick-pay-fee">
              {formatMxn(split.feeCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-text">{q.carrier.receive}</dt>
            <dd className="font-semibold text-text tabular-nums" data-testid="quick-pay-net">
              {formatMxn(split.quickNetCents)}
            </dd>
          </div>
        </dl>
        <StateNotice state={state} />
        <Button type="submit" size="sm" loading={pending}>
          {q.carrier.confirm}
        </Button>
      </form>
    </Disclosure>
  );
}

/**
 * The admin approves a request. When the exposure with this trip would go
 * over the limit, the form says so and asks to confirm.
 */
export function ApproveQuickPayForm({
  tripId,
  overLimit,
}: {
  tripId: string;
  /** The warning when the projected exposure goes over the limit. */
  overLimit: string | null;
}) {
  const [state, action, pending] = useActionState(approveQuickPayAction, {});
  return (
    <form action={action} className="space-y-2" noValidate>
      <input type="hidden" name="tripId" value={tripId} />
      {overLimit && (
        <>
          <Notice tone="error">{overLimit}</Notice>
          <label className="flex items-center gap-2.5 px-1 text-subhead text-text">
            <input type="checkbox" name="confirmOverLimit" className="size-4 accent-accent" />
            {q.admin.confirmOverLimit}
          </label>
        </>
      )}
      <StateNotice state={state} />
      <Button type="submit" size="sm" loading={pending}>
        {q.admin.approve}
      </Button>
    </form>
  );
}

/** The admin rejects a request with the reason the carrier sees. */
export function RejectQuickPayForm({ tripId }: { tripId: string }) {
  const id = useId();
  const [state, action, pending] = useActionState(rejectQuickPayAction, {});
  return (
    <Disclosure summary={q.admin.reject} look="inline" tone="red" open={Boolean(state.error)}>
      <form action={action} className="mt-2 space-y-3" noValidate>
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`} className="block px-1">
            {q.admin.rejectReason}
          </Label>
          <Input
            id={`${id}-reason`}
            name="reason"
            maxLength={500}
            autoComplete="off"
            aria-describedby={`${id}-help`}
          />
          <p id={`${id}-help`} className="px-1 text-footnote text-text-dim">
            {q.admin.rejectReasonHelp}
          </p>
        </div>
        <StateNotice state={state} />
        <Button type="submit" variant="destructive" size="sm" loading={pending}>
          {q.admin.rejectSubmit}
        </Button>
      </form>
    </Disclosure>
  );
}

/** The quick pay fee (basis points) and the exposure limit (pesos; empty: none). */
export function QuickPaySettingsForm({
  feeBps,
  limitPesos,
}: {
  feeBps: number;
  /** The limit as the field shows it ("50000.00"), or empty. */
  limitPesos: string;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(setQuickPaySettingsAction, {});
  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-fee`} className="block px-1">
            {q.admin.feeLabel}
          </Label>
          <Input
            id={`${id}-fee`}
            name="feeBps"
            inputMode="numeric"
            defaultValue={feeBps}
            aria-describedby={`${id}-fee-help`}
          />
          <p id={`${id}-fee-help`} className="px-1 text-footnote text-text-dim">
            {q.admin.feeHelp}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-limit`} className="block px-1">
            {q.admin.limitLabel}
          </Label>
          <Input
            id={`${id}-limit`}
            name="limit"
            inputMode="decimal"
            defaultValue={limitPesos}
            autoComplete="off"
            aria-describedby={`${id}-limit-help`}
          />
          <p id={`${id}-limit-help`} className="px-1 text-footnote text-text-dim">
            {q.admin.limitHelp}
          </p>
        </div>
      </div>
      <StateNotice state={state} />
      <Button type="submit" variant="secondary" loading={pending}>
        {q.admin.saveSettings}
      </Button>
    </form>
  );
}
