'use client';

import {
  carrierWebCopy,
  CITY_PRESETS,
  findCityPreset,
  fleetCopy,
  formatDateTime,
  mexicoCityParts,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { Field } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Field as FormField, fieldHelpId } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { SAVED_CITY_ID } from '@/lib/carrier/availability';
import type { Availability } from '@/lib/carrier/fleet';
import { clearCarrierAvailability, setCarrierAvailability } from '@/lib/carrier/fleet-actions';
import type { FormState } from '@/lib/forms';

const c = fleetCopy.availability;
const w = carrierWebCopy.fleet.availability;

/**
 * Where and from when the unit is free (set_vehicle_availability, B18) and
 * the button to mark it as not available. A unit with expired documents
 * cannot be made available; the server enforces it too. It sits in the side
 * column of the unit's screen, so its buttons are secondary.
 */
export function AvailabilityForm({
  vehicleId,
  current,
  blocked,
}: {
  vehicleId: string;
  current: Availability | null;
  blocked: boolean;
}) {
  const id = useId();
  // Editing keeps the saved moment unless the carrier changes it.
  const parts = mexicoCityParts(current ? new Date(current.available_from) : new Date());
  // A trip can leave the unit free in a city that is not a preset (its
  // destination): that place stays an option, and the default, so changing
  // only the moment does not move the unit.
  const preset = current ? findCityPreset(current.city, current.state) : undefined;
  const savedElsewhere = current !== null && preset === undefined;
  const initial: FormState = {
    values: {
      cityId: preset?.id ?? (savedElsewhere ? SAVED_CITY_ID : 'mty'),
      date: parts.date,
      time: parts.time,
    },
  };
  const [state, action, pending] = useActionState(setCarrierAvailability, initial);
  const [clearState, clearAction, clearing] = useActionState(clearCarrierAvailability, {});
  const values = state.values ?? initial.values ?? {};
  // After a successful save the state carries only the message: the fields
  // keep showing the saved values (the page's, refreshed by revalidation).
  const fieldState: FormState = { ...state, values };
  const cityError = state.fieldErrors?.cityId;

  return (
    <div className="space-y-4">
      <p className="text-subhead text-text">
        {current
          ? c.current(current.city, current.state, formatDateTime(current.available_from))
          : c.none}
      </p>
      {clearState.error && <Notice tone="error">{clearState.error}</Notice>}
      {clearState.message && <Notice tone="success">{clearState.message}</Notice>}
      {blocked ? (
        <Notice tone="error">{c.blocked}</Notice>
      ) : (
        <form action={action} className="space-y-4" noValidate>
          <p className="text-subhead text-text-dim">{c.subtitle}</p>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          {state.message && <Notice tone="success">{state.message}</Notice>}
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <div className="grid gap-4">
            <FormField label={c.cityLabel} htmlFor={`${id}-city`} error={cityError}>
              <Select
                id={`${id}-city`}
                name="cityId"
                defaultValue={values.cityId}
                aria-describedby={cityError ? fieldHelpId(`${id}-city`) : undefined}
              >
                {savedElsewhere && (
                  <option value={SAVED_CITY_ID}>
                    {current.city}, {current.state}
                  </option>
                )}
                {CITY_PRESETS.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.city}, {city.state}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field name="date" type="date" label={c.dateLabel} state={fieldState} />
              <Field
                name="time"
                type="time"
                label={c.timeLabel}
                state={fieldState}
                hint={w.dateTimeHint}
              />
            </div>
          </div>
          <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={clearing}>
            {c.save}
          </Button>
        </form>
      )}
      {current && (
        <form
          action={clearAction}
          onSubmit={(event) => {
            if (!window.confirm(w.clearConfirm)) event.preventDefault();
          }}
        >
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <Button
            type="submit"
            variant="plain"
            size="sm"
            className="-ml-3"
            loading={clearing}
            disabled={pending}
          >
            {c.clear}
          </Button>
        </form>
      )}
    </div>
  );
}
