import {
  CITY_PRESETS,
  formatDateTime,
  mexicoCityParts,
  nearestCityPreset,
  releaseFormSchema,
  vehicleReleaseCopy,
  type ReleasePlace,
} from '@transport/shared';
import { useState, type ReactNode } from 'react';

import { validateForm, type FieldErrors } from '../lib/forms';
import { releaseErrorMessage, releaseVehicle, type ReleaseContext } from '../lib/release-api';
import type { Supabase } from '../lib/supabase';
import { ChoiceCell } from './choice-cell';
import { TripMap } from './trip-map';
import { FieldCell, Footnote, Group, GroupLabel, Notice, SectionHeader, TextCell } from './ui';
import type { FormSave } from './vehicle-form';

const copy = vehicleReleaseCopy.screen;
const CITY_OPTIONS = CITY_PRESETS.map((c) => ({ value: c.id, label: c.city }));

/**
 * "Liberar unidad" (G5, D20): the schematic map with the route of the
 * cancelled trip and the unit's last known point, where the truck is (that
 * point or a city; the app has no tappable map yet) and from when it is free
 * (now by default). release_vehicle checks everything again. Returns the
 * section and its submit, the screen's primary action.
 */
export function useRelease({
  client,
  context,
  onReleased,
}: {
  client: Supabase;
  /** The release the unit waits for; none, nothing to show. */
  context: ReleaseContext | null;
  onReleased: () => Promise<void>;
}): { section: ReactNode; submit: FormSave | null } {
  const now = mexicoCityParts(new Date());
  const last = context?.last ?? null;
  const near = last ? nearestCityPreset(last) : null;
  const [values, setValues] = useState({
    place: (last ? 'last' : 'city') as ReleasePlace,
    cityId: near?.id ?? 'mty',
    date: now.date,
    time: now.time,
    notes: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!context) return { section: null, submit: null };
  const route = `${context.origin.city} → ${context.destination.city}`;
  const places = [
    ...(last ? [{ value: 'last' as const, label: copy.places.last }] : []),
    { value: 'city' as const, label: copy.places.city },
  ];

  async function release() {
    if (!context) return;
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

  const section = (
    <>
      <SectionHeader title={copy.title} />
      <Group>
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
        <TextCell icon="location" tone="dim">
          {context.last ? copy.lastKnown(formatDateTime(context.last.at)) : copy.noLastKnown}
        </TextCell>
      </Group>
      <Footnote>{copy.help(route)}</Footnote>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Group>
        <ChoiceCell
          label={copy.where}
          options={places}
          value={values.place}
          onChange={(place) => {
            if (place) setValues((v) => ({ ...v, place }));
          }}
          error={errors.place}
        />
        {values.place === 'last' && near ? (
          <TextCell>{copy.near(near.city, near.state)}</TextCell>
        ) : null}
        {values.place === 'city' ? (
          <ChoiceCell
            label={copy.city}
            options={CITY_OPTIONS}
            value={values.cityId}
            onChange={(cityId) => {
              if (cityId) setValues((v) => ({ ...v, cityId }));
            }}
            error={errors.cityId}
          />
        ) : null}
      </Group>
      <GroupLabel>{copy.when}</GroupLabel>
      <Group>
        <FieldCell
          label={copy.date}
          value={values.date}
          onChangeText={(date) => setValues((v) => ({ ...v, date }))}
          error={errors.date}
          keyboardType="numbers-and-punctuation"
        />
        <FieldCell
          label={copy.time}
          value={values.time}
          onChangeText={(time) => setValues((v) => ({ ...v, time }))}
          error={errors.time}
          keyboardType="numbers-and-punctuation"
        />
        <FieldCell
          label={copy.notes}
          value={values.notes}
          onChangeText={(notes) => setValues((v) => ({ ...v, notes }))}
          error={errors.notes}
          multiline
          maxLength={1000}
        />
      </Group>
    </>
  );
  return {
    section,
    submit: { label: copy.submit, onPress: () => void release(), loading: busy, disabled: busy },
  };
}
