import {
  availabilityFormSchema,
  CITY_PRESETS,
  findCityPreset,
  fleetCopy,
  formatDateTime,
  mexicoCityParts,
} from '@transport/shared';
import { useState, type ReactNode } from 'react';

import { clearAvailability, setAvailability, type Availability } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { ChoiceCell } from './choice-cell';
import type { FormSave } from './vehicle-form';
import { Button, FieldCell, Footnote, Group, Notice, SectionHeader, TextCell } from './ui';

const copy = fleetCopy.availability;
const CITY_OPTIONS = CITY_PRESETS.map((c) => ({ value: c.id, label: c.city }));

/**
 * Where and from when the unit is free (set_vehicle_availability). A unit
 * with expired documents cannot be made available (B18); the server enforces
 * it too. Returns the section and, unless it is blocked, its save for the
 * screen's bottom bar.
 */
export function useAvailability({
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
}): { section: ReactNode; save: FormSave | null } {
  // Editing keeps the saved moment unless the carrier changes it.
  const initial = mexicoCityParts(current ? new Date(current.available_from) : new Date());
  const [values, setValues] = useState({
    cityId: (current && findCityPreset(current.city, current.state)?.id) ?? 'mty',
    date: initial.date,
    time: initial.time,
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

  const section = (
    <>
      <SectionHeader title={copy.title} />
      <Group>
        <TextCell icon="location">
          {current
            ? copy.current(current.city, current.state, formatDateTime(current.available_from))
            : copy.none}
        </TextCell>
      </Group>
      {message ? (
        <Notice tone={message.tone === 'info' ? 'highlight' : 'danger'}>{message.text}</Notice>
      ) : null}
      {blocked ? (
        <Notice tone="danger">{copy.blocked}</Notice>
      ) : (
        <>
          <Group>
            <ChoiceCell
              label={copy.cityLabel}
              options={CITY_OPTIONS}
              value={values.cityId}
              onChange={(cityId) => {
                if (cityId) setValues((v) => ({ ...v, cityId }));
              }}
              error={errors.cityId}
            />
            <FieldCell
              label={copy.dateLabel}
              value={values.date}
              onChangeText={(date) => setValues((v) => ({ ...v, date }))}
              error={errors.date}
              keyboardType="numbers-and-punctuation"
            />
            <FieldCell
              label={copy.timeLabel}
              value={values.time}
              onChangeText={(time) => setValues((v) => ({ ...v, time }))}
              error={errors.time}
              keyboardType="numbers-and-punctuation"
            />
          </Group>
          <Footnote>{copy.subtitle}</Footnote>
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
    </>
  );
  return {
    section,
    save: blocked
      ? null
      : { label: copy.save, onPress: save, loading: busy === 'save', disabled: busy !== null },
  };
}
