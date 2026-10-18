import {
  CITY_PRESETS,
  formatDateTime,
  mexicoCityParts,
  nearestCityPreset,
  releaseFormSchema,
  vehicleReleaseCopy,
  type ReleasePlace,
} from '@transport/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { validateForm, type FieldErrors } from '../lib/forms';
import { releaseErrorMessage, releaseVehicle, type ReleaseContext } from '../lib/release-api';
import type { Supabase } from '../lib/supabase';
import { spacing } from '../theme';
import { ChoiceChips, SectionTitle } from './fleet-ui';
import { TripMap } from './trip-map';
import { Body, Button, Field, Notice } from './ui';

const copy = vehicleReleaseCopy.screen;
const CITY_OPTIONS = CITY_PRESETS.map((c) => ({ value: c.id, label: c.city }));

/**
 * "Liberar unidad" (G5, D20): the schematic map with the route of the
 * cancelled trip and the unit's last known point, where the truck is (that
 * point or a city; the app has no tappable map yet) and from when it is free
 * (now by default). release_vehicle checks everything again.
 */
export function ReleaseSection({
  client,
  context,
  onReleased,
}: {
  client: Supabase;
  context: ReleaseContext;
  onReleased: () => Promise<void>;
}) {
  const now = mexicoCityParts(new Date());
  const near = context.last ? nearestCityPreset(context.last) : null;
  const [values, setValues] = useState({
    place: (context.last ? 'last' : 'city') as ReleasePlace,
    cityId: near?.id ?? 'mty',
    date: now.date,
    time: now.time,
    notes: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const route = `${context.origin.city} → ${context.destination.city}`;
  const places = [
    ...(context.last ? [{ value: 'last' as const, label: copy.places.last }] : []),
    { value: 'city' as const, label: copy.places.city },
  ];

  async function release() {
    const parsed = validateForm(releaseFormSchema, {
      ...values,
      latitude: values.place === 'last' ? context.last?.lat : undefined,
      longitude: values.place === 'last' ? context.last?.lng : undefined,
    });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setBusy(true);
    setError(null);
    try {
      await releaseVehicle(client, context.taskId, parsed.data);
      await onReleased();
    } catch (cause) {
      setError(releaseErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>{copy.help(route)}</Body>
      <TripMap
        trips={[
          {
            key: context.taskId,
            origin: context.origin,
            destination: context.destination,
            position: context.last,
          },
        ]}
      />
      <Body>
        {context.last ? copy.lastKnown(formatDateTime(context.last.at)) : copy.noLastKnown}
      </Body>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ChoiceChips
        label={copy.where}
        options={places}
        value={values.place}
        onChange={(place) => setValues((v) => ({ ...v, place }))}
        error={errors.place}
      />
      {values.place === 'last' && near ? <Body>{copy.near(near.city, near.state)}</Body> : null}
      {values.place === 'city' ? (
        <ChoiceChips
          label={copy.city}
          options={CITY_OPTIONS}
          value={values.cityId}
          onChange={(cityId) => setValues((v) => ({ ...v, cityId }))}
          error={errors.cityId}
        />
      ) : null}
      <Body>{copy.when}</Body>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label={copy.date}
            value={values.date}
            onChangeText={(date) => setValues((v) => ({ ...v, date }))}
            error={errors.date}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label={copy.time}
            value={values.time}
            onChangeText={(time) => setValues((v) => ({ ...v, time }))}
            error={errors.time}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      <Field
        label={copy.notes}
        value={values.notes}
        onChangeText={(notes) => setValues((v) => ({ ...v, notes }))}
        error={errors.notes}
        multiline
        maxLength={1000}
      />
      <Button label={copy.submit} onPress={() => void release()} loading={busy} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
