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

import { Field, Notice } from '@/components/auth-forms';
import { ReleaseMap } from '@/components/carrier/release-map';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
    <form action={action} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">{c.help(route)}</p>
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
      <p className="text-sm">
        {context.last ? c.lastKnown(formatDateTime(context.last.at)) : c.noLastKnown}
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{c.where}</legend>
        <div className="space-y-2 text-sm">
          {places.map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="place"
                value={value}
                checked={place === value}
                onChange={() => setPlace(value)}
                className="accent-accent"
              />
              {c.places[value]}
              {value === 'last' && near && (
                <span className="text-muted-foreground">· {c.near(near.city, near.state)}</span>
              )}
            </label>
          ))}
        </div>
        {state.fieldErrors?.place && (
          <p className="text-xs text-destructive">{state.fieldErrors.place}</p>
        )}
        {place === 'map' && (
          <p className="text-xs text-muted-foreground">
            {pickedNear ? c.mapPicked(pickedNear.city, pickedNear.state) : c.mapHint}
          </p>
        )}
        {mapReady === false && <p className="text-xs text-muted-foreground">{c.mapUnavailable}</p>}
      </fieldset>

      {place === 'city' && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-city`}>{c.city}</Label>
          <select
            id={`${id}-city`}
            name="cityId"
            defaultValue={values.cityId ?? near?.id ?? 'mty'}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {CITY_PRESETS.map((city) => (
              <option key={city.id} value={city.id}>
                {city.city}, {city.state}
              </option>
            ))}
          </select>
          {state.fieldErrors?.cityId && (
            <p className="text-xs text-destructive">{state.fieldErrors.cityId}</p>
          )}
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{c.when}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
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

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notes`}>{c.notes}</Label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={values.notes}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {state.fieldErrors?.notes && (
          <p className="text-xs text-destructive">{state.fieldErrors.notes}</p>
        )}
      </div>

      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? c.submitting : c.submit}
      </Button>
    </form>
  );
}
