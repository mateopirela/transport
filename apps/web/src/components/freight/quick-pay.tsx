'use client';

import { formatBasisPoints, formatMxn, quickPayCopy, quickPaySplit } from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Notice } from '@/components/ui/notice';
import type { FormState } from '@/lib/forms';
import { requestQuickPayAction } from '@/lib/freight/quick-pay-actions';

// Quick pay (I4, D38): the carrier's request in Cobranza. The admin's
// decision and settings live in components/admin/quick-pay-forms.tsx.
// Postgres checks every rule again.

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
