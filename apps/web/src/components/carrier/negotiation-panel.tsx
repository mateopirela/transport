'use client';

import {
  carrierLoadsCopy,
  carrierNegotiationState,
  carrierWebCopy,
  formatDateTime,
  formatMxn,
  offerStatusLabels,
  offerStatusReasonText,
  sortOffers,
  type LoadStatus,
  type NegotiationOffer,
} from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Group } from '@/components/ui/group';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Pill } from '@/components/ui/pill';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { groupRow } from '@/components/ui/variants';
import {
  acceptProposedPrice,
  acceptShipperOffer,
  counterShipperOffer,
  makeCarrierOffer,
  rejectShipperOffer,
  withdrawCarrierOffer,
} from '@/lib/carrier/actions';
import type { FormState } from '@/lib/forms';

const c = carrierWebCopy.offer;
const a = carrierLoadsCopy.actions;
const states = carrierLoadsCopy.negotiation.states;

/** A unit the viewer may propose, with the business unit it belongs to. */
export interface PanelUnit {
  id: string;
  label: string;
  businessUnitId: string;
}

export interface PanelBusinessUnit {
  id: string;
  name: string;
}

/** Pesos for the amount field, e.g. 3_850_000 cents → "38500". */
function centsToPesosInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/**
 * The carrier's side of a negotiation (G10a, same rules as the app's
 * NegotiationPanel, B19): offer the proposed price or negotiate; accept,
 * counter or reject the shipper's counteroffer; withdraw its own pending
 * offer. Every action is an RPC that validates the actor, the business unit
 * and the state again (B05, G1a). Without a visible load (contracted with
 * another carrier) only the history and the outcome are shown.
 *
 * The state on top, the offers as a group of rows, and the actions folded in
 * one group: accepting is the screen's primary, the rest secondary or red.
 */
export function CarrierNegotiationPanel({
  load,
  offers,
  units,
  businessUnits,
  defaultVehicleId,
  defaultBusinessUnitId,
  negotiationBusinessUnitId,
}: {
  load: { id: string; status: LoadStatus; proposedPriceCents: number } | null;
  offers: readonly NegotiationOffer[];
  units: readonly PanelUnit[];
  /** Business units the viewer operates; a first offer without a unit needs one when there are several. */
  businessUnits: readonly PanelBusinessUnit[];
  /** Unit preselected in the forms (the one the load was recommended for, or the nearest). */
  defaultVehicleId: string | null;
  /** Business unit chosen in the picker, if one. */
  defaultBusinessUnitId: string | null;
  /** Business unit of the existing negotiation: a new unit must belong to it. */
  negotiationBusinessUnitId: string | null;
}) {
  const chain = sortOffers(offers);
  const latest = chain.at(-1);
  const state = carrierNegotiationState(chain, load?.status ?? 'contracted');
  const unitById = new Map(units.map((u) => [u.id, u]));
  // With a negotiation under way, only its business unit's units apply (make_offer, counter_offer).
  const options = negotiationBusinessUnitId
    ? units.filter((u) => u.businessUnitId === negotiationBusinessUnitId)
    : units;
  const defaultUnit = options.some((u) => u.id === defaultVehicleId) ? defaultVehicleId : null;
  const chooseBusinessUnit = !negotiationBusinessUnitId && businessUnits.length > 1;
  const proposed = load ? formatMxn(load.proposedPriceCents) : '';

  return (
    <div className="space-y-6">
      <Notice tone={state === 'won' ? 'success' : 'info'}>{states[state]}</Notice>

      {load && (state === 'open' || state === 'reopen') && (
        <div className="overflow-hidden rounded-2xl border bg-cell">
          <AcceptProposedForm
            loadId={load.id}
            proposed={proposed}
            vehicleId={defaultUnit}
            businessUnits={chooseBusinessUnit ? businessUnits : []}
            defaultBusinessUnitId={chooseBusinessUnit ? defaultBusinessUnitId : null}
          />
          <OfferForm
            action={makeCarrierOffer}
            title={c.negotiateTitle}
            summary={a.negotiate}
            submit={c.submit}
            hidden={{ loadId: load.id }}
            defaultAmount={centsToPesosInput(latest?.amount_cents ?? load.proposedPriceCents)}
            options={options}
            defaultUnit={defaultUnit}
            businessUnits={chooseBusinessUnit ? businessUnits : []}
            defaultBusinessUnitId={defaultBusinessUnitId}
          />
        </div>
      )}

      {load && state === 'respond' && latest && (
        <div className="overflow-hidden rounded-2xl border bg-cell">
          <ConfirmForm
            action={acceptShipperOffer}
            summary={a.accept}
            title={c.acceptTitle}
            help={a.acceptHelp(formatMxn(latest.amount_cents))}
            confirm={c.acceptConfirm}
            pending={c.accepting}
            hidden={{ offerId: latest.id }}
            tone="accept"
          />
          <OfferForm
            action={counterShipperOffer}
            title={c.counterTitle}
            summary={a.counter}
            submit={c.counterSubmit}
            hidden={{ offerId: latest.id }}
            defaultAmount={centsToPesosInput(latest.amount_cents)}
            options={options}
            defaultUnit={defaultUnit}
            businessUnits={[]}
            defaultBusinessUnitId={null}
          />
          <RejectForm offerId={latest.id} />
        </div>
      )}

      {load && state === 'awaiting_shipper' && latest && (
        <div className="overflow-hidden rounded-2xl border bg-cell">
          <ConfirmForm
            action={withdrawCarrierOffer}
            summary={a.withdraw}
            title={c.withdrawTitle}
            help={c.withdrawHelp}
            confirm={c.withdrawConfirm}
            pending={c.withdrawing}
            hidden={{ offerId: latest.id }}
            tone="withdraw"
          />
        </div>
      )}

      {chain.length > 0 && (
        <Group label={c.history}>
          <ol>
            {chain.map((offer) => {
              const unit = offer.vehicle_id ? unitById.get(offer.vehicle_id) : undefined;
              const reason = offerStatusReasonText(offer.status_reason);
              return (
                <li key={offer.id} className={`${groupRow} space-y-1 px-4 py-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-headline text-text tabular-nums">
                      {c.side[offer.side]} · {formatMxn(offer.amount_cents)}
                    </p>
                    <Pill tone={offer.status === 'accepted' ? 'ok' : 'neutral'}>
                      {offerStatusLabels[offer.status]}
                    </Pill>
                  </div>
                  <p className="text-footnote text-text-dim tabular-nums">
                    {formatDateTime(offer.created_at)}
                  </p>
                  {offer.conditions && (
                    <p className="text-subhead text-text-dim">
                      {c.conditions}: {offer.conditions}
                    </p>
                  )}
                  {offer.side === 'carrier' && (
                    <p className="text-footnote text-text-dim">
                      {c.unit}: {unit?.label ?? (offer.vehicle_id ? '—' : c.noUnit)}
                    </p>
                  )}
                  {reason && (
                    <p className="text-footnote text-text-dim">
                      {c.reason}: {reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </Group>
      )}
    </div>
  );
}

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Hidden({ values }: { values: Record<string, string | null> }) {
  return Object.entries(values).map(([name, value]) =>
    value === null ? null : <input key={name} type="hidden" name={name} value={value} />,
  );
}

function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
    </>
  );
}

/** The title and the line of a folded form. */
function FormIntro({ title, help }: { title: string; help?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-headline text-text">{title}</p>
      {help && <p className="text-subhead text-text-dim">{help}</p>}
    </div>
  );
}

/**
 * One-step offer of the proposed price, after an explicit confirmation. The
 * unit decides the business unit; without one, and with several business
 * units to choose from, the confirmation asks for it (make_offer needs one).
 */
function AcceptProposedForm({
  loadId,
  proposed,
  vehicleId,
  businessUnits,
  defaultBusinessUnitId,
}: {
  loadId: string;
  proposed: string;
  vehicleId: string | null;
  /** Business units to choose from; empty when the unit or the only one decides. */
  businessUnits: readonly PanelBusinessUnit[];
  defaultBusinessUnitId: string | null;
}) {
  const [state, action, pending] = useActionState(acceptProposedPrice, {});
  const askBusinessUnit = vehicleId === null && businessUnits.length > 0;
  return (
    <Disclosure summary={a.acceptProposed} tone="accent" open={Boolean(state.error)}>
      <form action={action} className="space-y-4">
        <FormIntro title={c.acceptProposedTitle} help={a.acceptProposedHelp(proposed)} />
        <Feedback state={state} />
        <Hidden values={{ loadId, vehicleId }} />
        {askBusinessUnit ? (
          <Field
            label={c.businessUnitField}
            htmlFor="accept-business-unit"
            hint={c.acceptProposedBusinessUnitHint}
          >
            <Select
              id="accept-business-unit"
              name="businessUnitId"
              required
              defaultValue={defaultBusinessUnitId ?? ''}
              aria-describedby={fieldHelpId('accept-business-unit')}
            >
              <option value="">—</option>
              {businessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Hidden values={{ businessUnitId: defaultBusinessUnitId }} />
        )}
        <Button type="submit" variant="primary" loading={pending} className="w-full">
          {pending ? c.sending : c.acceptProposedConfirm}
        </Button>
      </form>
    </Disclosure>
  );
}

/** Amount, conditions, unit and (for a first offer of a multi-unit staff) business unit. */
function OfferForm({
  action: serverAction,
  title,
  summary,
  submit,
  hidden,
  defaultAmount,
  options,
  defaultUnit,
  businessUnits,
  defaultBusinessUnitId,
}: {
  action: Action;
  title: string;
  summary: string;
  submit: string;
  hidden: Record<string, string>;
  defaultAmount: string;
  options: readonly PanelUnit[];
  defaultUnit: string | null;
  businessUnits: readonly PanelBusinessUnit[];
  defaultBusinessUnitId: string | null;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  const errors = state.fieldErrors ?? {};
  const id = (field: string) => `${summary}-${field}`.replaceAll(/\s+/gu, '-').toLowerCase();
  return (
    <Disclosure summary={summary} open={Boolean(state.error || state.fieldErrors)}>
      <form action={action} className="space-y-4" noValidate>
        <FormIntro title={title} />
        <Feedback state={state} />
        <Hidden values={hidden} />
        <Field label={c.amount} htmlFor={id('amount')} error={errors.amount}>
          <Input
            id={id('amount')}
            name="amount"
            inputMode="decimal"
            defaultValue={state.values?.amount ?? defaultAmount}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? fieldHelpId(id('amount')) : undefined}
            className="tabular-nums"
          />
        </Field>
        <Field label={c.conditionsField} htmlFor={id('conditions')} error={errors.conditions}>
          <Textarea
            id={id('conditions')}
            name="conditions"
            rows={2}
            maxLength={1000}
            defaultValue={state.values?.conditions}
            aria-invalid={errors.conditions ? true : undefined}
            aria-describedby={errors.conditions ? fieldHelpId(id('conditions')) : undefined}
            className="min-h-20"
          />
        </Field>
        <Field label={c.unitField} htmlFor={id('unit')} error={errors.vehicleId} hint={c.unitHint}>
          <Select
            id={id('unit')}
            name="vehicleId"
            defaultValue={state.values?.vehicleId ?? defaultUnit ?? ''}
            aria-invalid={errors.vehicleId ? true : undefined}
            aria-describedby={fieldHelpId(id('unit'))}
          >
            <option value="">{c.unitNone}</option>
            {options.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </Select>
        </Field>
        {businessUnits.length > 0 && (
          <Field
            label={c.businessUnitField}
            htmlFor={id('business-unit')}
            error={errors.businessUnitId}
            hint={c.businessUnitHint}
          >
            <Select
              id={id('business-unit')}
              name="businessUnitId"
              defaultValue={state.values?.businessUnitId ?? defaultBusinessUnitId ?? ''}
              aria-invalid={errors.businessUnitId ? true : undefined}
              aria-describedby={fieldHelpId(id('business-unit'))}
            >
              <option value="">—</option>
              {businessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button type="submit" variant="secondary" loading={pending} className="w-full">
          {pending ? c.sending : submit}
        </Button>
      </form>
    </Disclosure>
  );
}

/** An action the other side sees or that cannot be undone, behind a confirmation. */
function ConfirmForm({
  action: serverAction,
  summary,
  title,
  help,
  confirm,
  pending: pendingLabel,
  hidden,
  tone,
}: {
  action: Action;
  summary: string;
  title: string;
  help: string;
  confirm: string;
  pending: string;
  hidden: Record<string, string>;
  /** `accept`: the screen's primary; `withdraw`: takes back the own offer (red). */
  tone: 'accept' | 'withdraw';
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <Disclosure
      summary={summary}
      tone={tone === 'accept' ? 'accent' : 'red'}
      open={Boolean(state.error)}
    >
      <form action={action} className="space-y-4">
        <FormIntro title={title} help={help} />
        <Feedback state={state} />
        <Hidden values={hidden} />
        <Button
          type="submit"
          variant={tone === 'accept' ? 'primary' : 'destructive'}
          loading={pending}
          className="w-full"
        >
          {pending ? pendingLabel : confirm}
        </Button>
      </form>
    </Disclosure>
  );
}

function RejectForm({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState(rejectShipperOffer, {});
  const reasonError = state.fieldErrors?.reason;
  return (
    <Disclosure summary={a.reject} tone="red" open={Boolean(state.error || reasonError)}>
      <form action={action} className="space-y-4" noValidate>
        <FormIntro title={c.rejectTitle} help={a.rejectHelp} />
        <Feedback state={state} />
        <Hidden values={{ offerId }} />
        <Field label={c.rejectReason} htmlFor="reject-reason" error={reasonError}>
          <Textarea
            id="reject-reason"
            name="reason"
            rows={2}
            maxLength={1000}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? fieldHelpId('reject-reason') : undefined}
            className="min-h-20"
          />
        </Field>
        <Button type="submit" variant="destructive" loading={pending} className="w-full">
          {pending ? c.rejecting : c.rejectConfirm}
        </Button>
      </form>
    </Disclosure>
  );
}
