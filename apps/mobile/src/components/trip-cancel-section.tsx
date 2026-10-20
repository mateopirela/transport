import {
  cancelLeavesUnitPending,
  cancelTripSchema,
  TRIP_CANCELLATION_REASONS,
  tripCancelCopy,
  tripCancellationReasonLabels,
  type TripCancellationReason,
  type TripStatus,
} from '@transport/shared';
import { useRef, useState } from 'react';

import { carrierTripErrorMessage } from '../lib/carrier-trip-errors';
import { cancelTrip } from '../lib/carrier-trips-api';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { ChoiceCell } from './choice-cell';
import { ConfirmSheet, type ConfirmSheetHandle } from './sheet';
import { Button, FieldCell, Footnote, Group, Notice, SectionHeader } from './ui';

const copy = tripCancelCopy;
const REASONS = TRIP_CANCELLATION_REASONS.map((value) => ({
  value,
  label: tripCancellationReasonLabels[value],
}));

/**
 * Cancels the trip before the operator starts loading (cancel_trip, G5): a
 * reason from the list and notes (required for "Otro"), confirmed in a
 * sheet. If the unit already set off, it warns that the unit will wait for
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
  const confirmSheet = useRef<ConfirmSheetHandle>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<{ reasonCode: TripCancellationReason | ''; notes: string }>({
    reasonCode: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return <Button label={copy.open} variant="plain" onPress={() => setOpen(true)} />;
  }

  function confirm() {
    const parsed = validateForm(cancelTripSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    confirmSheet.current?.ask({
      title: copy.title,
      body: copy.help,
      confirmLabel: copy.confirm,
      cancelLabel: copy.keep,
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          await cancelTrip(client, tripId, parsed.data);
          await onCancelled();
        } catch (cause) {
          setError(carrierTripErrorMessage(cause));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <>
      <SectionHeader title={copy.title} />
      {cancelLeavesUnitPending(status, hasUnit) ? (
        <Notice tone="info">{copy.onTheWay}</Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Group>
        <ChoiceCell
          label={copy.reason}
          options={REASONS}
          value={values.reasonCode || undefined}
          onChange={(reasonCode) => {
            if (reasonCode) setValues((v) => ({ ...v, reasonCode }));
          }}
          error={errors.reasonCode}
        />
        <FieldCell
          label={copy.notes}
          value={values.notes}
          onChangeText={(notes) => setValues((v) => ({ ...v, notes }))}
          error={errors.notes}
          placeholder={copy.notesHint}
          multiline
          maxLength={1000}
        />
      </Group>
      <Footnote>{copy.help}</Footnote>
      <Button
        label={copy.confirm}
        variant="destructive"
        onPress={confirm}
        loading={busy}
        disabled={busy}
      />
      <ConfirmSheet ref={confirmSheet} />
    </>
  );
}
