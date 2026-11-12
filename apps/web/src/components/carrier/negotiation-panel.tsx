'use client';

import {
  brokeredCopy,
  carrierLoadsCopy,
  carrierNegotiationState,
  carrierWebCopy,
  formatDateTime,
  formatMoney,
  offerStatusLabels,
  offerStatusReasonText,
  offerStatusTone,
  sortOffers,
  type LoadStatus,
  type NegotiationOffer,
} from '@transport/shared';
import Link from 'next/link';
import { useActionState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DetailRail, RailActions, RailSection } from '@/components/ui/detail-layout';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { Pill } from '@/components/ui/pill';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
const n = carrierWebCopy.negotiations;

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
 * NegotiationPanel, B19), as the rail of a detail (docs/plan-fulmis.md §1.5):
 * where it stands, the price, the actions and the history of offers. Every
 * action is a button (§1.5: never a folded row) that opens a dialog saying
 * what will happen; each one is an RPC that validates the actor, the business
 * unit and the state again (B05, G1a). Offering the proposed price, or
 * accepting the client's counteroffer, is the screen's one primary; the rest
 * are secondary or red. Without a visible load (contracted with another
 * carrier) only the history and the outcome are shown.
 */
export function CarrierNegotiationPanel({
  load,
  offers,
  units,
  businessUnits,
  defaultVehicleId,
  defaultBusinessUnitId,
  negotiationBusinessUnitId,
  tripHref,
}: {
  /** `brokered`: published by Transport (I6), which answers the offers. */
  load: { id: string; status: LoadStatus; proposedPriceCents: number; brokered?: boolean } | null;
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
  /** The company's trip of a won load: the next step, and the rail's primary. */
  tripHref?: string | null;
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
  const sideLabel = (offer: NegotiationOffer) =>
    offer.side === 'shipper' && load?.brokered ? brokeredCopy.counterpart : c.side[offer.side];

  return (
    <DetailRail>
      <RailSection label={c.title}>
        <p className="text-subhead text-text">{states[state]}</p>
      </RailSection>

      {load && (
        <RailSection label={carrierWebCopy.detail.labels.price}>
          <Money cents={load.proposedPriceCents} size="numeral" className="block" />
          {latest && (
            <p className="text-footnote text-text-dim">
              {n.columns.latest}: {n.lastOffer(formatMoney(latest.amount_cents), sideLabel(latest))}
            </p>
          )}
        </RailSection>
      )}

      {load && (state === 'open' || state === 'reopen') && (
        <RailSection>
          <RailActions>
            <AcceptProposedDialog
              loadId={load.id}
              proposed={formatMoney(load.proposedPriceCents)}
              vehicleId={defaultUnit}
              businessUnits={chooseBusinessUnit ? businessUnits : []}
              defaultBusinessUnitId={chooseBusinessUnit ? defaultBusinessUnitId : null}
            />
            <OfferDialog
              action={makeCarrierOffer}
              trigger={a.negotiate}
              title={c.negotiateTitle}
              submit={c.submit}
              hidden={{ loadId: load.id }}
              defaultAmount={centsToPesosInput(latest?.amount_cents ?? load.proposedPriceCents)}
              options={options}
              defaultUnit={defaultUnit}
              businessUnits={chooseBusinessUnit ? businessUnits : []}
              defaultBusinessUnitId={defaultBusinessUnitId}
            />
          </RailActions>
        </RailSection>
      )}

      {load && state === 'respond' && latest && (
        <RailSection>
          <RailActions>
            <ActionDialog
              action={acceptShipperOffer}
              trigger={a.accept}
              title={c.acceptTitle}
              description={a.acceptHelp(formatMoney(latest.amount_cents))}
              confirm={c.acceptConfirm}
              hidden={{ offerId: latest.id }}
              tone="primary"
            />
            <OfferDialog
              action={counterShipperOffer}
              trigger={a.counter}
              title={c.counterTitle}
              submit={c.counterSubmit}
              hidden={{ offerId: latest.id }}
              defaultAmount={centsToPesosInput(latest.amount_cents)}
              options={options}
              defaultUnit={defaultUnit}
              businessUnits={[]}
              defaultBusinessUnitId={null}
            />
            <RejectDialog offerId={latest.id} />
          </RailActions>
        </RailSection>
      )}

      {load && state === 'awaiting_shipper' && latest && (
        <RailSection>
          <RailActions>
            <ActionDialog
              action={withdrawCarrierOffer}
              trigger={a.withdraw}
              title={c.withdrawTitle}
              description={c.withdrawHelp}
              confirm={c.withdrawConfirm}
              hidden={{ offerId: latest.id }}
              tone="destructive"
            />
          </RailActions>
        </RailSection>
      )}

      {state === 'won' && tripHref && (
        <RailSection>
          <RailActions>
            <Link href={tripHref} className={buttonVariants({ variant: 'primary' })}>
              {carrierWebCopy.trips.seeTrip}
            </Link>
          </RailActions>
        </RailSection>
      )}

      {chain.length > 0 && (
        <RailSection label={c.history}>
          <ol className="divide-y divide-separator">
            {[...chain].reverse().map((offer) => {
              const unit = offer.vehicle_id ? unitById.get(offer.vehicle_id) : undefined;
              const reason = offerStatusReasonText(offer.status_reason);
              return (
                <li key={offer.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-subhead text-text">
                      <span className="font-semibold">{sideLabel(offer)}</span> ·{' '}
                      <Money cents={offer.amount_cents} />
                    </p>
                    <Pill tone={offerStatusTone(offer.status)}>
                      {offerStatusLabels[offer.status]}
                    </Pill>
                  </div>
                  <p className="text-meta text-text-dim">{formatDateTime(offer.created_at)}</p>
                  {offer.conditions && (
                    <p className="text-footnote text-text-dim">
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
        </RailSection>
      )}
    </DetailRail>
  );
}

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Hidden({ values }: { values: Record<string, string | null> }) {
  return Object.entries(values).map(([name, value]) =>
    value === null ? null : <input key={name} type="hidden" name={name} value={value} />,
  );
}

/**
 * Offers the proposed price in one step, after the dialog confirms it. The
 * unit decides the business unit; without one, and with several business
 * units to choose from, the dialog asks for it (make_offer needs one).
 */
function AcceptProposedDialog({
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
    <ConfirmDialog
      trigger={<Button variant="primary">{a.acceptProposed}</Button>}
      title={c.acceptProposedTitle}
      description={a.acceptProposedHelp(proposed)}
      confirmLabel={c.acceptProposedConfirm}
      action={action}
      pending={pending}
      error={state.error}
    >
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
    </ConfirmDialog>
  );
}

/** Amount, conditions, unit and (for a first offer of a multi-unit staff) business unit, in a dialog. */
function OfferDialog({
  action: serverAction,
  trigger,
  title,
  submit,
  hidden,
  defaultAmount,
  options,
  defaultUnit,
  businessUnits,
  defaultBusinessUnitId,
}: {
  action: Action;
  trigger: string;
  title: string;
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
  const id = (field: string) => `${trigger}-${field}`.replaceAll(/\s+/gu, '-').toLowerCase();
  return (
    <ConfirmDialog
      trigger={<Button variant="secondary">{trigger}</Button>}
      title={title}
      confirmLabel={submit}
      action={action}
      pending={pending}
      error={state.error}
    >
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
    </ConfirmDialog>
  );
}

/**
 * An action the other side sees or that cannot be undone, behind its
 * dialog: accepting the counteroffer (the primary) or withdrawing the own
 * offer (red).
 */
function ActionDialog({
  action: serverAction,
  trigger,
  title,
  description,
  confirm,
  hidden,
  tone,
}: {
  action: Action;
  trigger: string;
  title: string;
  description: string;
  confirm: string;
  hidden: Record<string, string>;
  tone: 'primary' | 'destructive';
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <ConfirmDialog
      trigger={<Button variant={tone}>{trigger}</Button>}
      title={title}
      description={description}
      confirmLabel={confirm}
      destructive={tone === 'destructive'}
      action={action}
      pending={pending}
      error={state.error}
    >
      <Hidden values={hidden} />
    </ConfirmDialog>
  );
}

function RejectDialog({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState(rejectShipperOffer, {});
  const reasonError = state.fieldErrors?.reason;
  return (
    <ConfirmDialog
      trigger={<Button variant="destructive">{a.reject}</Button>}
      title={c.rejectTitle}
      description={a.rejectHelp}
      confirmLabel={c.rejectConfirm}
      destructive
      action={action}
      pending={pending}
      error={state.error}
    >
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
    </ConfirmDialog>
  );
}
