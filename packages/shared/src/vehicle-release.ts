// G5 (D20): pure helpers of the cancellation reason and of the release of a
// unit whose trip was cancelled after it set off. Postgres enforces the same
// rules (cancel_trip, release_vehicle); the app and the web share these.
import { z } from 'zod';

import { fleetErrorCopy } from './copy/fleet';
import { validationMessages as m } from './copy/validation';
import { tripCancellationReasonLabels, vehicleReleaseCopy } from './copy/vehicle-release';
import type { TripCancellationReason, TripStatus } from './enums';
import { CITY_PRESETS, mexicoCityDateTime, type CityPreset } from './fleet';
import { haversineKm, type LatLng } from './geo';
import { enumField, formError, optionalText } from './schemas/common';

/** What the shipper and the carrier read about a cancellation: the reason and its notes. */
export function cancellationText(
  code: TripCancellationReason | null,
  notes: string | null,
): string | null {
  const label = code ? tripCancellationReasonLabels[code] : null;
  const text = notes?.trim() || null;
  if (label && text && code !== 'other') return `${label}. ${text}`;
  return text ?? label;
}

/**
 * Whether cancelling now leaves the unit pending release: the operator
 * already set off (mirrors the trigger trips_create_release_task).
 */
export function cancelLeavesUnitPending(status: TripStatus, hasUnit: boolean): boolean {
  return hasUnit && !['pending_assignment', 'assigned', 'cancelled'].includes(status);
}

/** The preset city nearest to a point: the city and state written with a released position. */
export function nearestCityPreset(point: LatLng): CityPreset {
  let best: CityPreset = CITY_PRESETS[0];
  let bestKm = Number.POSITIVE_INFINITY;
  for (const city of CITY_PRESETS) {
    const km = haversineKm(point, city);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

/** Where the truck is: its last known point, a preset city, or a point picked on the map (web). */
export const RELEASE_PLACES = ['last', 'city', 'map'] as const;
export type ReleasePlace = (typeof RELEASE_PLACES)[number];

/** A number from a form field (a string on the web, a number on the app); empty is missing. */
const coordinate = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
  z.number({ error: m.coordinates }).finite({ error: m.coordinates }).optional(),
);

/** The release form (input of release_vehicle). */
export const releaseFormSchema = z
  .object(
    {
      place: enumField(RELEASE_PLACES),
      cityId: z.string().optional(),
      latitude: coordinate,
      longitude: coordinate,
      date: z.string({ error: m.date }),
      time: z.string({ error: m.time }),
      notes: optionalText(1000),
    },
    formError,
  )
  .transform((value, ctx) => {
    const availableFrom = mexicoCityDateTime(value.date, value.time);
    if (!availableFrom) {
      ctx.addIssue({ code: 'custom', message: m.dateTime, path: ['date'] });
      return z.NEVER;
    }
    let point: LatLng;
    let city: CityPreset;
    if (value.place === 'city') {
      const preset = CITY_PRESETS.find((c) => c.id === value.cityId);
      if (!preset) {
        ctx.addIssue({ code: 'custom', message: m.invalidOption, path: ['cityId'] });
        return z.NEVER;
      }
      point = preset;
      city = preset;
    } else {
      const { latitude: lat, longitude: lng } = value;
      if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        ctx.addIssue({
          code: 'custom',
          message: vehicleReleaseCopy.errors.invalidPlace,
          path: ['place'],
        });
        return z.NEVER;
      }
      point = { lat, lng };
      city = nearestCityPreset(point);
    }
    return {
      availableFrom,
      latitude: point.lat,
      longitude: point.lng,
      city: city.city,
      state: city.state,
      notes: value.notes ?? null,
    };
  });

export type ReleaseFormInput = z.input<typeof releaseFormSchema>;
export type ReleaseFormValues = z.output<typeof releaseFormSchema>;

const e = vehicleReleaseCopy.errors;

/** Errors of release_vehicle and vehicle_release_context, by their fixed English message. */
const RELEASE_ERRORS: readonly (readonly [RegExp, string])[] = [
  [/^release task not found/u, e.notFound],
  [/^release task is not pending/u, e.alreadyReleased],
  [/^vehicle is pending release/u, e.pendingRelease],
  [/^vehicle has expired documents/u, fleetErrorCopy.expiredDocuments],
  [/^invalid coordinates|^city and state are required/u, e.invalidPlace],
  [/^vehicle is archived/u, e.archived],
];

/** Spanish text for a known error message of the release RPCs, or null when unknown. */
export function releaseErrorText(message: string): string | null {
  for (const [pattern, text] of RELEASE_ERRORS) if (pattern.test(message)) return text;
  return null;
}
