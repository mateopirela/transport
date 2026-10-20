import {
  carrierLoadsCopy,
  carrierNegotiationState,
  formatDateTime,
  formatMxn,
  offerStatusLabels,
  sortOffers,
  type NegotiationOffer,
  type OfferStatus,
} from '@transport/shared';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';

import {
  acceptOffer,
  counterOffer,
  makeOffer,
  rejectOffer,
  withdrawOffer,
  type CarrierUnit,
  type LoadNegotiation,
  type OfferInput,
  unitLabel,
} from '../lib/loads-api';
import { offerErrorMessage } from '../lib/offer-errors';
import { centsToPesosInput, parseOfferDraft, type OfferDraft } from '../lib/offer-form';
import type { Supabase } from '../lib/supabase';
import { track } from '../lib/track';
import { ChoiceCell } from './choice-cell';
import { ConfirmSheet, type ConfirmSheetHandle } from './sheet';
import { StatusRow } from './status-row';
import {
  type BottomBar,
  Button,
  FieldCell,
  Group,
  GroupLabel,
  Notice,
  SectionHeader,
  type PillTone,
} from './ui';

const copy = carrierLoadsCopy;

const OFFER_TONES: Partial<Record<OfferStatus, PillTone>> = { accepted: 'ok', pending: 'accent' };

type BarProps = Pick<ComponentProps<typeof BottomBar>, 'action' | 'secondary'>;

/**
 * The carrier's side of a negotiation (as in the deck's mockup): accept the
 * proposed price, negotiate (offer or counteroffer) or reject the shipper's
 * counteroffer; withdraw its own pending offer. Every action is an RPC that
 * validates the actor and the state again (B05); the ones the other side sees
 * or that cannot be undone are confirmed in a sheet first.
 *
 * Returns the section for the screen and, when there is one, the screen's
 * primary action for its BottomBar (and the secondary one beside it).
 */
export function useNegotiation({
  client,
  data,
  units,
  defaultVehicleId,
  offerSource,
  onChanged,
}: {
  client: Supabase;
  data: LoadNegotiation;
  units: readonly CarrierUnit[];
  defaultVehicleId: string | undefined;
  /** How the carrier reached the load: from a recommendation or the search (B25). */
  offerSource: 'recommendation' | 'search';
  onChanged: () => Promise<void>;
}): { section: ReactNode; bar: BarProps | null } {
  const { load } = data;
  const offers = sortOffers(data.offers);
  const latest = offers.at(-1);
  const state = carrierNegotiationState(offers, load.status);
  const confirmSheet = useRef<ConfirmSheetHandle>(null);
  const [form, setForm] = useState<OfferDraft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setForm(null);
      if (done) setNotice(done);
    } catch (e) {
      setError(offerErrorMessage(e));
    } finally {
      setBusy(false);
      // Refresh either way: a failure is often a state that changed meanwhile.
      await onChanged().catch(() => undefined);
    }
  }

  /** Asks in a sheet before an action the other side sees or that cannot be undone. */
  function confirm(title: string, body: string, onConfirm: () => Promise<void>) {
    confirmSheet.current?.ask({
      title,
      body,
      confirmLabel: copy.actions.confirm,
      cancelLabel: copy.actions.cancel,
      onConfirm,
    });
  }

  const proposed = formatMxn(load.proposed_price_cents);

  /** Sends an offer (or a counteroffer) and records where it came from. */
  async function sendOffer(input: OfferInput, counterTo?: string) {
    if (counterTo) await counterOffer(client, counterTo, input);
    else await makeOffer(client, load.id, input);
    track({
      name: 'offer_submitted',
      loadId: load.id,
      properties: { source: offerSource, counter: counterTo !== undefined },
    });
  }

  function acceptProposed() {
    const input: OfferInput = {
      amountCents: load.proposed_price_cents,
      vehicleId: defaultVehicleId,
    };
    confirm(copy.actions.acceptProposed, copy.actions.acceptProposedHelp(proposed), () =>
      run(() => sendOffer(input), copy.actions.sent),
    );
  }

  function accept(offer: NegotiationOffer) {
    confirm(copy.actions.accept, copy.actions.acceptHelp(formatMxn(offer.amount_cents)), () =>
      run(() => acceptOffer(client, offer.id), copy.actions.accepted),
    );
  }

  function reject(offer: NegotiationOffer) {
    confirm(copy.actions.reject, copy.actions.rejectHelp, () =>
      run(() => rejectOffer(client, offer.id)),
    );
  }

  function openForm() {
    const base = latest?.amount_cents ?? load.proposed_price_cents;
    setErrors({});
    setForm({ amount: centsToPesosInput(base), conditions: '', vehicleId: defaultVehicleId });
  }

  function submit() {
    if (!form) return;
    const parsed = parseOfferDraft(form);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    const input: OfferInput = parsed.data;
    void run(
      () => sendOffer(input, state === 'respond' && latest ? latest.id : undefined),
      copy.actions.sent,
    );
  }

  const unitOptions = units.map((u) => ({ value: u.id, label: unitLabel(u) }));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const negotiable = state === 'open' || state === 'reopen';

  let bar: BarProps | null = null;
  if (form) {
    bar = {
      action: { label: copy.actions.submit, onPress: submit, loading: busy },
      secondary: { label: copy.actions.cancel, onPress: () => setForm(null), disabled: busy },
    };
  } else if (negotiable) {
    bar = {
      action: { label: copy.actions.acceptProposed, onPress: acceptProposed, loading: busy },
    };
  } else if (state === 'respond' && latest) {
    bar = {
      action: { label: copy.actions.accept, onPress: () => accept(latest), loading: busy },
      secondary: { label: copy.actions.counter, onPress: openForm, disabled: busy },
    };
  }

  const section = (
    <>
      <SectionHeader title={copy.negotiation.title} />
      <Notice tone={state === 'lost' ? 'warning' : 'info'}>{copy.negotiation.states[state]}</Notice>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {form ? (
        <Group>
          <FieldCell
            label={copy.actions.amount}
            value={form.amount}
            onChangeText={(amount) => setForm({ ...form, amount })}
            keyboardType="decimal-pad"
            error={errors.amount}
          />
          <FieldCell
            label={copy.actions.conditions}
            value={form.conditions}
            onChangeText={(conditions) => setForm({ ...form, conditions })}
            maxLength={1000}
            multiline
            error={errors.conditions}
          />
          {unitOptions.length > 0 ? (
            <ChoiceCell
              label={copy.actions.unit}
              options={unitOptions}
              value={form.vehicleId}
              clearable
              onChange={(vehicleId) => setForm({ ...form, vehicleId })}
              error={errors.vehicleId}
            />
          ) : null}
        </Group>
      ) : null}

      {!form && negotiable ? (
        <Button
          label={copy.actions.negotiate}
          variant="secondary"
          onPress={openForm}
          disabled={busy}
        />
      ) : null}
      {!form && state === 'respond' && latest ? (
        <Button
          label={copy.actions.reject}
          variant="plain"
          onPress={() => reject(latest)}
          disabled={busy}
        />
      ) : null}
      {state === 'awaiting_shipper' && latest ? (
        <Button
          label={copy.actions.withdraw}
          variant="secondary"
          onPress={() => void run(() => withdrawOffer(client, latest.id))}
          loading={busy}
        />
      ) : null}

      {offers.length > 0 ? (
        <>
          <GroupLabel>{copy.negotiation.history}</GroupLabel>
          <Group>
            {offers.map((o) => {
              const unit = o.vehicle_id ? unitById.get(o.vehicle_id) : undefined;
              return (
                <StatusRow
                  key={o.id}
                  title={`${copy.negotiation.side[o.side]} · ${formatMxn(o.amount_cents)}`}
                  lines={[
                    formatDateTime(o.created_at),
                    // The conditions in full: the carrier reads them before accepting.
                    o.conditions,
                    o.side === 'carrier'
                      ? `${copy.negotiation.unit}: ${unit ? unitLabel(unit) : copy.negotiation.noUnit}`
                      : null,
                  ]}
                  pill={{
                    label: offerStatusLabels[o.status],
                    tone: OFFER_TONES[o.status] ?? 'neutral',
                  }}
                />
              );
            })}
          </Group>
        </>
      ) : null}
      <ConfirmSheet ref={confirmSheet} />
    </>
  );

  return { section, bar };
}
