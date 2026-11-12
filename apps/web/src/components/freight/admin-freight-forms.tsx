'use client';

import {
  adminPanelCopy,
  freightCopy,
  freightPaymentDirectionLabels,
  PAYMENT_TERMS_DAYS,
  toMexicoCityDate,
  type FreightPaymentDirection,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { ConfirmSubmit } from '@/components/admin/confirm-submit';
import { bpsText, formAmount, formText } from '@/lib/admin/confirm-text';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import {
  recordFreightPaymentAction,
  resolveFreightReviewAction,
  setCommissionAction,
  setCompanyCommissionAction,
  setCompanyTermsAction,
} from '@/lib/freight/actions';
import type { FormState } from '@/lib/forms';

const c = freightCopy.admin;
const k = adminPanelCopy.confirm;

function StateNotice({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * "Registrar pago" of a trip: who paid (the client or Fulmis to the
 * carrier), the amount, the date and the SPEI tracking key. Only the sides
 * still owed are offered.
 */
export function RecordPaymentForm({
  tripId,
  directions,
}: {
  tripId: string;
  directions: readonly FreightPaymentDirection[];
}) {
  const id = useId();
  const [state, action, pending] = useActionState(recordFreightPaymentAction, {});
  const today = toMexicoCityDate(new Date().toISOString());
  return (
    <Disclosure summary={c.recordPayment} look="inline" tone="accent" open={Boolean(state.error)}>
      <form action={action} className="mt-2 space-y-3" noValidate>
        <input type="hidden" name="tripId" value={tripId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-direction`} className="block">
              {c.direction}
            </Label>
            <Select id={`${id}-direction`} name="direction" defaultValue={directions[0]}>
              {directions.map((direction) => (
                <option key={direction} value={direction}>
                  {freightPaymentDirectionLabels[direction]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-amount`} className="block">
              {c.paymentAmount}
            </Label>
            <Input id={`${id}-amount`} name="amount" inputMode="decimal" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-date`} className="block">
              {c.paidOn}
            </Label>
            <Input id={`${id}-date`} name="paidOn" type="date" defaultValue={today} max={today} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-reference`} className="block">
              {c.speiReference}
            </Label>
            <Input
              id={`${id}-reference`}
              name="speiReference"
              maxLength={40}
              autoComplete="off"
              aria-describedby={`${id}-reference-help`}
            />
            <p id={`${id}-reference-help`} className="text-footnote text-text-dim">
              {c.speiReferenceHelp}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-note`} className="block">
              {c.note}
            </Label>
            <Input id={`${id}-note`} name="note" maxLength={500} autoComplete="off" />
          </div>
        </div>
        <StateNotice state={state} />
        <ConfirmSubmit
          size="sm"
          loading={pending}
          title={k.recordPayment.title}
          confirmLabel={k.recordPayment.confirm}
          // Without an amount or a key there is nothing to confirm: the server says what is missing.
          skip={(data) => !formAmount(data, 'amount') || !formText(data, 'speiReference')}
          description={(data) =>
            k.recordPayment.body(
              freightPaymentDirectionLabels[
                formText(data, 'direction') as FreightPaymentDirection
              ] ?? '',
              formAmount(data, 'amount') ?? '',
              formText(data, 'speiReference').toUpperCase(),
            )
          }
        >
          {c.save}
        </ConfirmSubmit>
      </form>
    </Disclosure>
  );
}

/** Marks the manual review of a cancelled trip with payments as resolved. */
export function ResolveReviewForm({ tripId }: { tripId: string }) {
  const id = useId();
  const [state, action, pending] = useActionState(resolveFreightReviewAction, {});
  return (
    <Disclosure summary={c.resolveReview} look="inline" tone="red" open={Boolean(state.error)}>
      <form action={action} className="mt-2 space-y-3" noValidate>
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-note`} className="block">
            {c.reviewNote}
          </Label>
          <Input id={`${id}-note`} name="note" maxLength={500} autoComplete="off" />
        </div>
        <StateNotice state={state} />
        <ConfirmSubmit
          size="sm"
          loading={pending}
          title={k.resolveReview.title}
          description={k.resolveReview.body}
          confirmLabel={k.resolveReview.confirm}
        >
          {c.resolveReview}
        </ConfirmSubmit>
      </form>
    </Disclosure>
  );
}

/** The default commission, in basis points. */
export function CommissionSettingForm({ commissionBps }: { commissionBps: number | null }) {
  const id = useId();
  const [state, action, pending] = useActionState(setCommissionAction, {});
  return (
    <form action={action} className="space-y-2" noValidate>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 space-y-1.5">
          <Label htmlFor={`${id}-bps`} className="block">
            {c.commissionDefault}
          </Label>
          <Input
            id={`${id}-bps`}
            name="commissionBps"
            inputMode="numeric"
            defaultValue={commissionBps ?? ''}
            aria-describedby={`${id}-help`}
          />
        </div>
        <ConfirmSubmit
          loading={pending}
          title={k.commission.title}
          confirmLabel={k.commission.confirm}
          description={(data) => k.commission.body(bpsText(formText(data, 'commissionBps')))}
        >
          {c.saveCommission}
        </ConfirmSubmit>
      </div>
      <p id={`${id}-help`} className="text-footnote text-text-dim">
        {c.commissionHelp}
      </p>
      <StateNotice state={state} />
    </form>
  );
}

/** A shipper's payment terms (admin, company detail). */
export function CompanyTermsForm({
  companyId,
  termsDays,
}: {
  companyId: string;
  termsDays: number | null;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(setCompanyTermsAction, {});
  return (
    <form action={action} className="space-y-2" noValidate>
      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 space-y-1.5">
          <Label htmlFor={`${id}-terms`} className="block">
            {c.companyTerms}
          </Label>
          <Select id={`${id}-terms`} name="termsDays" defaultValue={termsDays ?? ''}>
            <option value="">{c.noTerms}</option>
            {PAYMENT_TERMS_DAYS.map((days) => (
              <option key={days} value={days}>
                {freightCopy.termsDays(days)}
              </option>
            ))}
          </Select>
        </div>
        <ConfirmSubmit
          loading={pending}
          title={k.terms.title}
          confirmLabel={k.terms.confirm}
          description={(data) => {
            const days = Number(formText(data, 'termsDays'));
            return k.terms.body(days > 0 ? freightCopy.termsDays(days) : c.noTerms);
          }}
        >
          {c.saveTerms}
        </ConfirmSubmit>
      </div>
      <p className="text-footnote text-text-dim">{c.companyTermsHelp}</p>
      <StateNotice state={state} />
    </form>
  );
}

/** A carrier's commission override (admin, company detail). */
export function CompanyCommissionForm({
  companyId,
  commissionBps,
}: {
  companyId: string;
  commissionBps: number | null;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(setCompanyCommissionAction, {});
  return (
    <form action={action} className="space-y-2" noValidate>
      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 space-y-1.5">
          <Label htmlFor={`${id}-bps`} className="block">
            {c.companyCommission}
          </Label>
          <Input
            id={`${id}-bps`}
            name="commissionBps"
            inputMode="numeric"
            placeholder={c.generalCommission}
            defaultValue={commissionBps ?? ''}
          />
        </div>
        <ConfirmSubmit
          loading={pending}
          title={k.companyCommission.title}
          confirmLabel={k.companyCommission.confirm}
          description={(data) => {
            const value = formText(data, 'commissionBps');
            return k.companyCommission.body(value ? bpsText(value) : k.companyCommission.general);
          }}
        >
          {c.saveCompanyCommission}
        </ConfirmSubmit>
      </div>
      <p className="text-footnote text-text-dim">{c.companyCommissionHelp}</p>
      <StateNotice state={state} />
    </form>
  );
}
