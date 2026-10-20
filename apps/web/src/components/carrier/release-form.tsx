'use client';

import {
  CITY_PRESETS,
  clientTripsCopy,
  formatDateTime,
  mexicoCityParts,
  nearestCityPreset,
  vehicleReleaseCopy,
  type LatLng,
  type ReleasePlace,
} from '@transport/shared';
import { useActionState, useCallback, useId, useMemo, useState } from 'react';

import { Field } from '@/components/auth-forms';
import { ReleaseMap } from '@/components/carrier/release-map';
import { Button } from '@/components/ui/button';
import { ErrorText, Field as FormField, fieldHelpId } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { groupRow } from '@/components/ui/variants';
import { releaseCarrierUnit } from '@/lib/carrier/release-actions';
import type { ReleaseContext } from '@/lib/carrier/release';
import type { FormState } from '@/lib/forms';

const c = vehicleReleaseCopy.screen;
const m = clientTripsCopy.map;

/**
 * "Liberar unidad" (G5, D20): where the truck is (its last known point, a
 * city, or a point on the map when Maps is available) and from when it is
 * free (now by default), with optional notes. release_vehicle checks it all
 * again; on success the action reloads the unit's screen.
 */
export function ReleaseForm({
  vehicleId,
  route,
  context,
}: {
  vehicleId: string;
  route: string;
  context: ReleaseContext;
}) {
  const id = useId();
  const now = mexicoCityParts(new Date());
  const [state, action, pending] = useActionState(releaseCarrierUnit, {
    values: { date: now.date, time: now.time },
  } satisfies FormState);
  const [place, setPlace] = useState<ReleasePlace>(
    (state.values?.place as ReleasePlace | undefined) ?? (context.last ? 'last' : 'city'),
  );
  const [picked, setPicked] = useState<LatLng | null>(null);
  // Unknown until the map loads (or fails, or there is no key).
  const [mapReady, setMapReady] = useState<boolean | null>(null);
  const onPick = useCallback((point: LatLng) => {
    setPicked(point);
    setPlace('map');
  }, []);
  // Stable, so a pick does not restart the route effect of the map (its fitBounds).
  const origin = useMemo(() => ({ ...context.origin, label: m.origin }), [context.origin]);
  const destination = useMemo(
    () => ({ ...context.destination, label: m.destination }),
    [context.destination],
  );
  const values = state.values ?? {};
  const point = place === 'last' ? context.last : place === 'map' ? picked : null;
  const near = context.last ? nearestCityPreset(context.last) : null;
  const pickedNear = picked ? nearestCityPreset(picked) : null;
  const places: ReleasePlace[] = [
    ...(context.last ? (['last'] as const) : []),
    'city',
    ...(mapReady === true ? (['map'] as const) : []),
  ];

  return (
    <form action={action} className="space-y-5" noValidate>
      <p className="text-subhead text-text-dim">{c.help(route)}</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="taskId" value={context.taskId} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="latitude" value={point?.lat ?? ''} />
      <input type="hidden" name="longitude" value={point?.lng ?? ''} />

      <ReleaseMap
        origin={origin}
        destination={destination}
        last={context.last}
        picked={picked}
        onPick={onPick}
        onReady={setMapReady}
      />
      <p className="text-footnote text-text-dim">
        {context.last ? c.lastKnown(formatDateTime(context.last.at)) : c.noLastKnown}
      </p>

      <fieldset>
        <legend className="mb-1.5 px-1 text-label text-text-dim">{c.where}</legend>
        <div className="overflow-hidden rounded-2xl border bg-cell">
          {places.map((value) => (
            <label
              key={value}
              className={`${groupRow} flex min-h-12.5 cursor-pointer items-center gap-3 px-4 py-2.5 text-body text-text has-checked:bg-accent-soft`}
            >
              <input
                type="radio"
                name="place"
                value={value}
                checked={place === value}
                onChange={() => setPlace(value)}
                className="size-4 accent-accent"
              />
              <span>
                {c.places[value]}
                {value === 'last' && near && (
                  <span className="text-text-dim"> · {c.near(near.city, near.state)}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-1.5 space-y-1">
          {state.fieldErrors?.place && <ErrorText>{state.fieldErrors.place}</ErrorText>}
          {place === 'map' && (
            <p className="px-1 text-footnote text-text-dim">
              {pickedNear ? c.mapPicked(pickedNear.city, pickedNear.state) : c.mapHint}
            </p>
          )}
          {mapReady === false && (
            <p className="px-1 text-footnote text-text-dim">{c.mapUnavailable}</p>
          )}
        </div>
      </fieldset>

      {place === 'city' && (
        <FormField label={c.city} htmlFor={`${id}-city`} error={state.fieldErrors?.cityId}>
          <Select
            id={`${id}-city`}
            name="cityId"
            defaultValue={values.cityId ?? near?.id ?? 'mty'}
            aria-describedby={state.fieldErrors?.cityId ? fieldHelpId(`${id}-city`) : undefined}
          >
            {CITY_PRESETS.map((city) => (
              <option key={city.id} value={city.id}>
                {city.city}, {city.state}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <fieldset>
        <legend className="mb-1.5 px-1 text-label text-text-dim">{c.when}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="date" type="date" label={c.date} state={{ ...state, values }} />
          <Field
            name="time"
            type="time"
            label={c.time}
            state={{ ...state, values }}
            hint={c.whenHint}
          />
        </div>
      </fieldset>

      <FormField label={c.notes} htmlFor={`${id}-notes`} error={state.fieldErrors?.notes}>
        <Textarea
          id={`${id}-notes`}
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={values.notes}
          aria-describedby={state.fieldErrors?.notes ? fieldHelpId(`${id}-notes`) : undefined}
          className="min-h-20"
        />
      </FormField>

      <Button type="submit" variant="primary" loading={pending}>
        {pending ? c.submitting : c.submit}
      </Button>
    </form>
  );
}
