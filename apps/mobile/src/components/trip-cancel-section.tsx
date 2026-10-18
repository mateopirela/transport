import {
  cancelLeavesUnitPending,
  cancelTripSchema,
  TRIP_CANCELLATION_REASONS,
  tripCancelCopy,
  tripCancellationReasonLabels,
  type TripCancellationReason,
  type TripStatus,
} from '@transport/shared';
import { useState } from 'react';
import { Alert } from 'react-native';

import { carrierTripErrorMessage } from '../lib/carrier-trip-errors';
import { cancelTrip } from '../lib/carrier-trips-api';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { ChoiceChips, SectionTitle } from './fleet-ui';
import { Body, Button, Field, Notice } from './ui';

const copy = tripCancelCopy;
const REASONS = TRIP_CANCELLATION_REASONS.map((value) => ({
  value,
  label: tripCancellationReasonLabels[value],
}));

/**
 * Cancels the trip before the operator starts loading (cancel_trip, G5): a
 * reason from the list and notes (required for "Otro"), confirmed in a
 * dialog. If the unit already set off, it warns that the unit will wait for
 * its release (D20).
 */
export function TripCancelSection({
  client,
  tripId,
  status,
  hasUnit,
  onCancelled,
}: {
  client: Supabase;
  tripId: string;
  status: TripStatus;
  hasUnit: boolean;
  onCancelled: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<{ reasonCode: TripCancellationReason | ''; notes: string }>({
    reasonCode: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return <Button label={copy.open} variant="link" onPress={() => setOpen(true)} />;
  }

  function confirm() {
    const parsed = validateForm(cancelTripSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    Alert.alert(copy.title, copy.help, [
      { text: copy.keep, style: 'cancel' },
      {
        text: copy.confirm,
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          setError(null);
          cancelTrip(client, tripId, parsed.data)
            .then(onCancelled)
            .catch((cause: unknown) => setError(carrierTripErrorMessage(cause)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <>
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>{copy.help}</Body>
      {cancelLeavesUnitPending(status, hasUnit) ? (
        <Notice tone="info">{copy.onTheWay}</Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ChoiceChips
        label={copy.reason}
        options={REASONS}
        value={values.reasonCode || undefined}
        onChange={(reasonCode) => setValues((v) => ({ ...v, reasonCode }))}
        error={errors.reasonCode}
      />
      <Field
        label={copy.notes}
        value={values.notes}
        onChangeText={(notes) => setValues((v) => ({ ...v, notes }))}
        error={errors.notes}
        placeholder={copy.notesHint}
        multiline
        maxLength={1000}
      />
      <Button
        label={copy.confirm}
        variant="secondary"
        onPress={confirm}
        loading={busy}
        disabled={busy}
      />
    </>
  );
}
