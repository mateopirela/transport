import {
  availabilityFormSchema,
  CITY_PRESETS,
  findCityPreset,
  fleetCopy,
  formatDateTime,
  mexicoCityParts,
} from '@transport/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { clearAvailability, setAvailability, type Availability } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { spacing } from '../theme';
import { ChoiceChips, SectionTitle } from './fleet-ui';
import { Body, Button, Field, Notice } from './ui';

const copy = fleetCopy.availability;
const CITY_OPTIONS = CITY_PRESETS.map((c) => ({ value: c.id, label: c.city }));

/**
 * Where and from when the unit is free (set_vehicle_availability). A unit
 * with expired documents cannot be made available (B18); the server enforces
 * it too.
 */
export function AvailabilitySection({
  client,
  vehicleId,
  current,
  blocked,
  onChanged,
}: {
  client: Supabase;
  vehicleId: string;
  current: Availability | null;
  blocked: boolean;
  onChanged: () => Promise<void>;
}) {
  const now = mexicoCityParts(new Date());
  const [values, setValues] = useState({
    cityId: (current && findCityPreset(current.city, current.state)?.id) ?? 'mty',
    date: now.date,
    time: now.time,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);

  async function run(kind: 'save' | 'clear', action: () => Promise<void>) {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: 'info', text: copy.saved });
      await onChanged();
    } catch (error) {
      setMessage({ tone: 'danger', text: fleetErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const parsed = validateForm(availabilityFormSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok) void run('save', () => setAvailability(client, vehicleId, parsed.data));
  }

  return (
    <View style={styles.section}>
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>
        {current
          ? copy.current(current.city, current.state, formatDateTime(current.available_from))
          : copy.none}
      </Body>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {blocked ? (
        <Notice tone="danger">{copy.blocked}</Notice>
      ) : (
        <>
          <Body>{copy.subtitle}</Body>
          <ChoiceChips
            label={copy.cityLabel}
            options={CITY_OPTIONS}
            value={values.cityId}
            onChange={(cityId) => setValues((v) => ({ ...v, cityId }))}
            error={errors.cityId}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field
                label={copy.dateLabel}
                value={values.date}
                onChangeText={(date) => setValues((v) => ({ ...v, date }))}
                error={errors.date}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.flex}>
              <Field
                label={copy.timeLabel}
                value={values.time}
                onChangeText={(time) => setValues((v) => ({ ...v, time }))}
                error={errors.time}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <Button
            label={copy.save}
            onPress={save}
            loading={busy === 'save'}
            disabled={busy !== null}
          />
        </>
      )}
      {current ? (
        <Button
          label={copy.clear}
          variant="secondary"
          onPress={() => void run('clear', () => clearAvailability(client, vehicleId))}
          loading={busy === 'clear'}
          disabled={busy !== null}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
