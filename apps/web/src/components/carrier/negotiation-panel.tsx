'use client';

import {
  carrierLoadsCopy,
  carrierNegotiationState,
  carrierWebCopy,
  formatDateTime,
  formatMxn,
  offerStatusLabels,
  sortOffers,
  type LoadStatus,
  type NegotiationOffer,
} from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  acceptProposedPrice,
  acceptShipperOffer,
  counterShipperOffer,
  makeCarrierOffer,
  rejectShipperOffer,
  withdrawCarrierOffer,
} from '@/lib/carrier/actions';
import type { FormState } from '@/lib/forms';
import { cn } from '@/lib/utils';

const c = carrierWebCopy.offer;
const a = carrierLoadsCopy.actions;
const states = carrierLoadsCopy.negotiation.states;
const textarea = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const select = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

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
    <div className="space-y-4">
      <Notice tone={state === 'won' ? 'success' : 'info'}>{states[state]}</Notice>

      {chain.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{c.history}</h3>
          <ol className="divide-y rounded-xl border bg-card">
            {chain.map((offer) => {
              const unit = offer.vehicle_id ? unitById.get(offer.vehicle_id) : undefined;
              return (
                <li key={offer.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {c.side[offer.side]} · {formatMxn(offer.amount_cents)}
                    </p>
                    <span
                      className={cn(
                        'text-xs',
                        offer.status === 'accepted' ? 'text-success' : 'text-muted-foreground',
                      )}
                    >
                      {offerStatusLabels[offer.status]} · {formatDateTime(offer.created_at)}
                    </span>
                  </div>
                  {offer.conditions && (
                    <p className="text-muted-foreground">
                      {c.conditions}: {offer.conditions}
                    </p>
                  )}
                  {offer.side === 'carrier' && (
                    <p className="text-xs text-muted-foreground">
                      {c.unit}: {unit?.label ?? (offer.vehicle_id ? '—' : c.noUnit)}
                    </p>
                  )}
                  {offer.status_reason && offer.status_reason !== 'other_offer_accepted' && (
                    <p className="text-xs text-muted-foreground">
                      {c.reason}: {offer.status_reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {load && (state === 'open' || state === 'reopen') && (
        <>
          <AcceptProposedForm
            loadId={load.id}
            proposed={proposed}
            vehicleId={defaultUnit}
            businessUnitId={chooseBusinessUnit ? defaultBusinessUnitId : null}
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
        </>
      )}

      {load && state === 'respond' && latest && (
        <>
          <ConfirmForm
            action={acceptShipperOffer}
            summary={a.accept}
            title={c.acceptTitle}
            help={a.acceptHelp(formatMxn(latest.amount_cents))}
            confirm={c.acceptConfirm}
            pending={c.accepting}
            hidden={{ offerId: latest.id }}
            tone="success"
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
        </>
      )}

      {load && state === 'awaiting_shipper' && latest && (
        <ConfirmForm
          action={withdrawCarrierOffer}
          summary={a.withdraw}
          title={c.withdrawTitle}
          help={c.withdrawHelp}
          confirm={c.withdrawConfirm}
          pending={c.withdrawing}
          hidden={{ offerId: latest.id }}
          tone="muted"
        />
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

/** One-step offer of the proposed price, after an explicit confirmation. */
function AcceptProposedForm({
  loadId,
  proposed,
  vehicleId,
  businessUnitId,
}: {
  loadId: string;
  proposed: string;
  vehicleId: string | null;
  businessUnitId: string | null;
}) {
  const [state, action, pending] = useActionState(acceptProposedPrice, {});
  return (
    <details className="rounded-lg border p-4 open:bg-muted/40" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-sm font-medium text-success">
        {a.acceptProposed}
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <p className="font-medium">{c.acceptProposedTitle}</p>
        <p className="text-sm text-muted-foreground">{a.acceptProposedHelp(proposed)}</p>
        <Feedback state={state} />
        <Hidden values={{ loadId, vehicleId, businessUnitId }} />
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? c.sending : c.acceptProposedConfirm}
        </Button>
      </form>
    </details>
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
    <details
      className="rounded-lg border p-4 open:bg-muted/40"
      open={Boolean(state.error || state.fieldErrors)}
    >
      <summary className="cursor-pointer text-sm font-medium">{summary}</summary>
      <form action={action} className="mt-4 space-y-3" noValidate>
        <p className="font-medium">{title}</p>
        <Feedback state={state} />
        <Hidden values={hidden} />
        <div className="space-y-1.5">
          <Label htmlFor={id('amount')}>{c.amount}</Label>
          <Input
            id={id('amount')}
            name="amount"
            inputMode="decimal"
            defaultValue={state.values?.amount ?? defaultAmount}
            aria-invalid={errors.amount ? true : undefined}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('conditions')}>{c.conditionsField}</Label>
          <textarea
            id={id('conditions')}
            name="conditions"
            rows={2}
            maxLength={1000}
            defaultValue={state.values?.conditions}
            aria-invalid={errors.conditions ? true : undefined}
            className={textarea}
          />
          {errors.conditions && <p className="text-xs text-destructive">{errors.conditions}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('unit')}>{c.unitField}</Label>
          <select
            id={id('unit')}
            name="vehicleId"
            defaultValue={state.values?.vehicleId ?? defaultUnit ?? ''}
            aria-invalid={errors.vehicleId ? true : undefined}
            className={select}
          >
            <option value="">{c.unitNone}</option>
            {options.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{errors.vehicleId ?? c.unitHint}</p>
        </div>
        {businessUnits.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor={id('business-unit')}>{c.businessUnitField}</Label>
            <select
              id={id('business-unit')}
              name="businessUnitId"
              defaultValue={state.values?.businessUnitId ?? defaultBusinessUnitId ?? ''}
              aria-invalid={errors.businessUnitId ? true : undefined}
              className={select}
            >
              <option value="">—</option>
              {businessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
            <p
              className={cn(
                'text-xs',
                errors.businessUnitId ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {errors.businessUnitId ?? c.businessUnitHint}
            </p>
          </div>
        )}
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? c.sending : submit}
        </Button>
      </form>
    </details>
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
  tone: 'success' | 'muted';
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <details className="rounded-lg border p-4 open:bg-muted/40" open={Boolean(state.error)}>
      <summary
        className={cn('cursor-pointer text-sm font-medium', tone === 'success' && 'text-success')}
      >
        {summary}
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{help}</p>
        <Feedback state={state} />
        <Hidden values={hidden} />
        <Button
          type="submit"
          variant={tone === 'success' ? 'accent' : 'outline'}
          disabled={pending}
        >
          {pending ? pendingLabel : confirm}
        </Button>
      </form>
    </details>
  );
}

function RejectForm({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState(rejectShipperOffer, {});
  const reasonError = state.fieldErrors?.reason;
  return (
    <details
      className="rounded-lg border p-4 open:bg-muted/40"
      open={Boolean(state.error || reasonError)}
    >
      <summary className="cursor-pointer text-sm font-medium text-destructive">{a.reject}</summary>
      <form action={action} className="mt-4 space-y-3" noValidate>
        <p className="font-medium">{c.rejectTitle}</p>
        <p className="text-sm text-muted-foreground">{a.rejectHelp}</p>
        <Feedback state={state} />
        <Hidden values={{ offerId }} />
        <div className="space-y-1.5">
          <Label htmlFor="reject-reason">{c.rejectReason}</Label>
          <textarea
            id="reject-reason"
            name="reason"
            rows={2}
            maxLength={1000}
            aria-invalid={reasonError ? true : undefined}
            className={textarea}
          />
          {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
        </div>
        <Button
          type="submit"
          variant="outline"
          className="border-destructive/40 text-destructive"
          disabled={pending}
        >
          {pending ? c.rejecting : c.rejectConfirm}
        </Button>
      </form>
    </details>
  );
}
