'use client';

import {
  freightCopy,
  freightPaymentDirectionLabels,
  PAYMENT_TERMS_DAYS,
  toMexicoCityDate,
  type FreightPaymentDirection,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { Button } from '@/components/ui/button';
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
            <Label htmlFor={`${id}-direction`} className="block px-1">
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
            <Label htmlFor={`${id}-amount`} className="block px-1">
              {c.paymentAmount}
            </Label>
            <Input id={`${id}-amount`} name="amount" inputMode="decimal" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-date`} className="block px-1">
              {c.paidOn}
            </Label>
            <Input id={`${id}-date`} name="paidOn" type="date" defaultValue={today} max={today} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-reference`} className="block px-1">
              {c.speiReference}
            </Label>
            <Input
              id={`${id}-reference`}
              name="speiReference"
              maxLength={40}
              autoComplete="off"
              aria-describedby={`${id}-reference-help`}
            />
            <p id={`${id}-reference-help`} className="px-1 text-footnote text-text-dim">
              {c.speiReferenceHelp}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-note`} className="block px-1">
              {c.note}
            </Label>
            <Input id={`${id}-note`} name="note" maxLength={500} autoComplete="off" />
          </div>
        </div>
        <StateNotice state={state} />
        <Button type="submit" size="sm" loading={pending}>
          {c.save}
        </Button>
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
          <Label htmlFor={`${id}-note`} className="block px-1">
            {c.reviewNote}
          </Label>
          <Input id={`${id}-note`} name="note" maxLength={500} autoComplete="off" />
        </div>
        <StateNotice state={state} />
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {c.resolveReview}
        </Button>
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
          <Label htmlFor={`${id}-bps`} className="block px-1">
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
        <Button type="submit" variant="secondary" loading={pending}>
          {c.saveCommission}
        </Button>
      </div>
      <p id={`${id}-help`} className="px-1 text-footnote text-text-dim">
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
          <Label htmlFor={`${id}-terms`} className="block px-1">
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
        <Button type="submit" variant="secondary" loading={pending}>
          {c.saveTerms}
        </Button>
      </div>
      <p className="px-1 text-footnote text-text-dim">{c.companyTermsHelp}</p>
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
          <Label htmlFor={`${id}-bps`} className="block px-1">
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
        <Button type="submit" variant="secondary" loading={pending}>
          {c.saveCompanyCommission}
        </Button>
      </div>
      <p className="px-1 text-footnote text-text-dim">{c.companyCommissionHelp}</p>
      <StateNotice state={state} />
    </form>
  );
}
