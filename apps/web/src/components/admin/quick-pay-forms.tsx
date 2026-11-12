'use client';

import { adminPanelCopy, quickPayCopy } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import type { FormState } from '@/lib/forms';
import {
  approveQuickPayAction,
  rejectQuickPayAction,
  setQuickPaySettingsAction,
} from '@/lib/freight/quick-pay-actions';

import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { formAmount, formText } from '@/lib/admin/confirm-text';

// Quick pay (I4, D38), the admin's side: the decision on a request in
// /admin/flete and the settings in /admin/ajustes. Each one asks first
// (docs/plan-fulmis.md §2 V5). Postgres checks every rule again.

const q = quickPayCopy.admin;
const k = adminPanelCopy.confirm;

function StateNotice({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * The admin approves a request, after a dialog that says what Fulmis pays
 * before the client does. When the exposure with this trip would go over the
 * limit, the form says so and asks to tick that it goes over.
 */
export function ApproveQuickPayForm({
  tripId,
  quickNet,
  overLimit,
}: {
  tripId: string;
  /** What Fulmis pays the carrier now, as money. */
  quickNet: string;
  /** The warning when the projected exposure goes over the limit. */
  overLimit: string | null;
}) {
  const [state, action, pending] = useActionState(approveQuickPayAction, {});
  // The page's projection, or the RPC's answer when another approval took
  // the room meanwhile: either way, the confirmation is asked for.
  const askConfirmation = Boolean(overLimit) || state.values?.overLimit === '1';
  return (
    <form action={action} className="space-y-2" noValidate>
      <input type="hidden" name="tripId" value={tripId} />
      {askConfirmation && (
        <>
          {overLimit && <Notice tone="error">{overLimit}</Notice>}
          <label className="flex items-center gap-2.5 text-subhead text-text">
            <input type="checkbox" name="confirmOverLimit" className="size-4 accent-accent" />
            {q.confirmOverLimit}
          </label>
        </>
      )}
      <StateNotice state={state} />
      <ConfirmSubmit
        size="sm"
        loading={pending}
        title={k.approveQuickPay.title}
        description={k.approveQuickPay.body(quickNet)}
        confirmLabel={k.approveQuickPay.confirm}
      >
        {q.approve}
      </ConfirmSubmit>
    </form>
  );
}

/** The admin rejects a request with the reason the carrier sees. */
export function RejectQuickPayForm({ tripId }: { tripId: string }) {
  const id = useId();
  const [state, action, pending] = useActionState(rejectQuickPayAction, {});
  return (
    <Disclosure summary={q.reject} look="inline" tone="red" open={Boolean(state.error)}>
      <form action={action} className="mt-2 space-y-3" noValidate>
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-2">
          <Label htmlFor={`${id}-reason`} className="block">
            {q.rejectReason}
          </Label>
          <Input
            id={`${id}-reason`}
            name="reason"
            maxLength={500}
            autoComplete="off"
            aria-describedby={`${id}-help`}
          />
          <p id={`${id}-help`} className="text-footnote text-text-dim">
            {q.rejectReasonHelp}
          </p>
        </div>
        <StateNotice state={state} />
        <ConfirmSubmit
          size="sm"
          variant="destructive"
          destructive
          loading={pending}
          title={k.rejectQuickPay.title}
          description={k.rejectQuickPay.body}
          confirmLabel={k.rejectQuickPay.confirm}
          // Without a reason the server asks for it: nothing to confirm yet.
          skip={(data) => !formText(data, 'reason')}
        >
          {q.rejectSubmit}
        </ConfirmSubmit>
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
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-fee`} className="block">
            {q.feeLabel}
          </Label>
          <Input
            id={`${id}-fee`}
            name="feeBps"
            inputMode="numeric"
            defaultValue={feeBps}
            aria-describedby={`${id}-fee-help`}
          />
          <p id={`${id}-fee-help`} className="text-footnote text-text-dim">
            {q.feeHelp}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-limit`} className="block">
            {q.limitLabel}
          </Label>
          <Input
            id={`${id}-limit`}
            name="limit"
            inputMode="decimal"
            defaultValue={limitPesos}
            autoComplete="off"
            aria-describedby={`${id}-limit-help`}
          />
          <p id={`${id}-limit-help`} className="text-footnote text-text-dim">
            {q.limitHelp}
          </p>
        </div>
      </div>
      <StateNotice state={state} />
      <ConfirmSubmit
        loading={pending}
        title={k.quickPaySettings.title}
        confirmLabel={k.quickPaySettings.confirm}
        description={(data) =>
          k.quickPaySettings.body(
            formText(data, 'feeBps'),
            formText(data, 'limit')
              ? (formAmount(data, 'limit') ?? formText(data, 'limit'))
              : k.quickPaySettings.noLimit,
          )
        }
      >
        {q.saveSettings}
      </ConfirmSubmit>
    </form>
  );
}
