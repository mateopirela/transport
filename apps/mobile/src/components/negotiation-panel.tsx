import {
  carrierLoadsCopy,
  carrierNegotiationState,
  formatDateTime,
  formatMxn,
  offerStatusLabels,
  sortOffers,
  type NegotiationOffer,
} from '@transport/shared';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

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
import { colors, spacing } from '../theme';
import { Badge, Card, ChoiceChips, SectionTitle } from './fleet-ui';
import { Body, Button, Field, Notice } from './ui';

const copy = carrierLoadsCopy;

/** Asks before an action that the other side sees or that cannot be undone. */
function confirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: copy.actions.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: copy.actions.confirm, onPress: () => resolve(true) },
    ]),
  );
}

/**
 * The carrier's side of a negotiation (as in the deck's mockup): accept the
 * proposed price, negotiate (offer or counteroffer) or reject the shipper's
 * counteroffer; withdraw its own pending offer. Every action is an RPC that
 * validates the actor and the state again (B05).
 */
export function NegotiationPanel({
  client,
  data,
  units,
  defaultVehicleId,
  onChanged,
}: {
  client: Supabase;
  data: LoadNegotiation;
  units: readonly CarrierUnit[];
  defaultVehicleId: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const { load } = data;
  const offers = sortOffers(data.offers);
  const latest = offers.at(-1);
  const state = carrierNegotiationState(offers, load.status);
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

  const proposed = formatMxn(load.proposed_price_cents);

  async function acceptProposed() {
    if (!(await confirm(copy.actions.acceptProposed, copy.actions.acceptProposedHelp(proposed))))
      return;
    const input: OfferInput = {
      amountCents: load.proposed_price_cents,
      vehicleId: defaultVehicleId,
    };
    await run(() => makeOffer(client, load.id, input), copy.actions.sent);
  }

  async function accept(offer: NegotiationOffer) {
    if (
      !(await confirm(copy.actions.accept, copy.actions.acceptHelp(formatMxn(offer.amount_cents))))
    )
      return;
    await run(() => acceptOffer(client, offer.id), copy.actions.accepted);
  }

  async function reject(offer: NegotiationOffer) {
    if (!(await confirm(copy.actions.reject, copy.actions.rejectHelp))) return;
    await run(() => rejectOffer(client, offer.id));
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
      () =>
        state === 'respond' && latest
          ? counterOffer(client, latest.id, input)
          : makeOffer(client, load.id, input),
      copy.actions.sent,
    );
  }

  const unitOptions = units.map((u) => ({ value: u.id, label: unitLabel(u) }));
  const unitById = new Map(units.map((u) => [u.id, u]));

  return (
    <View style={styles.panel}>
      <SectionTitle>{copy.negotiation.title}</SectionTitle>
      <Notice tone={state === 'won' ? 'info' : state === 'lost' ? 'warning' : 'info'}>
        {copy.negotiation.states[state]}
      </Notice>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="info">{notice}</Notice> : null}

      {offers.length > 0 ? (
        <>
          <Text style={styles.label}>{copy.negotiation.history}</Text>
          {offers.map((o) => {
            const unit = o.vehicle_id ? unitById.get(o.vehicle_id) : undefined;
            return (
              <Card
                key={o.id}
                title={`${copy.negotiation.side[o.side]} · ${formatMxn(o.amount_cents)}`}
                subtitle={formatDateTime(o.created_at)}
              >
                <Badge
                  label={offerStatusLabels[o.status]}
                  tone={
                    o.status === 'accepted'
                      ? 'success'
                      : o.status === 'pending'
                        ? 'info'
                        : 'neutral'
                  }
                />
                {o.conditions ? <Body>{o.conditions}</Body> : null}
                {o.side === 'carrier' ? (
                  <Text style={styles.muted}>
                    {`${copy.negotiation.unit}: ${unit ? unitLabel(unit) : copy.negotiation.noUnit}`}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}

      {form ? (
        <View style={styles.form}>
          <Field
            label={copy.actions.amount}
            value={form.amount}
            onChangeText={(amount) => setForm({ ...form, amount })}
            keyboardType="decimal-pad"
            error={errors.amount}
          />
          <Field
            label={copy.actions.conditions}
            value={form.conditions}
            onChangeText={(conditions) => setForm({ ...form, conditions })}
            maxLength={1000}
            multiline
            error={errors.conditions}
          />
          {unitOptions.length > 0 ? (
            <ChoiceChips
              label={copy.actions.unit}
              options={unitOptions}
              value={form.vehicleId}
              onChange={(vehicleId) =>
                setForm({
                  ...form,
                  vehicleId: vehicleId === form.vehicleId ? undefined : vehicleId,
                })
              }
              error={errors.vehicleId}
            />
          ) : null}
          <Button label={copy.actions.submit} onPress={submit} loading={busy} />
          <Button
            label={copy.actions.cancel}
            variant="link"
            onPress={() => setForm(null)}
            disabled={busy}
          />
        </View>
      ) : (
        <View style={styles.form}>
          {state === 'open' || state === 'reopen' ? (
            <>
              <Button
                label={copy.actions.acceptProposed}
                onPress={() => void acceptProposed()}
                loading={busy}
              />
              <Button
                label={copy.actions.negotiate}
                variant="secondary"
                onPress={openForm}
                disabled={busy}
              />
            </>
          ) : null}
          {state === 'respond' && latest ? (
            <>
              <Button
                label={copy.actions.accept}
                onPress={() => void accept(latest)}
                loading={busy}
              />
              <Button
                label={copy.actions.counter}
                variant="secondary"
                onPress={openForm}
                disabled={busy}
              />
              <Button
                label={copy.actions.reject}
                variant="link"
                onPress={() => void reject(latest)}
                disabled={busy}
              />
            </>
          ) : null}
          {state === 'awaiting_shipper' && latest ? (
            <Button
              label={copy.actions.withdraw}
              variant="secondary"
              onPress={() => void run(() => withdrawOffer(client, latest.id))}
              loading={busy}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  form: { gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
});
