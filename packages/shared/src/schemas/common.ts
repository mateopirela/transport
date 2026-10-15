import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { MAX_AMOUNT_CENTS } from '../money';

/** Trimmed, required text with a maximum length. */
export const requiredText = (max: number) =>
  z
    .string({ error: m.required })
    .trim()
    .min(1, { error: m.required })
    .max(max, { error: m.tooLong(max) });

/** Optional free text: empty strings become `undefined`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: m.tooLong(max) })
    .transform((value) => (value === '' ? undefined : value))
    .optional();

export const enumField = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: m.invalidOption });

/** A list of enum values without duplicates. */
export const enumList = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(enumField(values))
    .refine((items) => new Set(items).size === items.length, { error: m.duplicateItems });

export const emailField = z
  .string({ error: m.email })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: m.email }).max(254, { error: m.tooLong(254) }));

/** Mexican phone: 10 digits; spaces, dashes, parentheses and a +52 prefix are accepted. */
export const phoneField = z
  .string({ error: m.phone })
  .transform((value) => value.replace(/[\s()-]/gu, '').replace(/^\+?52(?=\d{10}$)/u, ''))
  .pipe(z.string().regex(/^\d{10}$/u, { error: m.phone }));

/** Integer MXN cents, greater than zero. */
export const amountCentsField = z
  .int({ error: m.amount })
  .positive({ error: m.positiveNumber })
  .max(MAX_AMOUNT_CENTS, { error: m.amountTooHigh });

export const positiveNumber = (max: number) =>
  z
    .number({ error: m.positiveNumber })
    .positive({ error: m.positiveNumber })
    .max(max, { error: m.positiveNumber });

/** ISO 8601 timestamp with an explicit offset, as stored in `timestamptz`. */
export const dateTimeField = z.iso.datetime({ offset: true, error: m.dateTime });

export const uuidField = z.uuid({ error: m.uuid });

/**
 * Cross-field checks run only when every field already parsed, so a malformed
 * field reports its own message instead of a confusing cross-field one.
 */
export const onlyWhenValid = {
  when: (payload: { issues: readonly unknown[] }) => payload.issues.length === 0,
};

/** Rough bounding box of Mexico; loads and vehicles operate only inside it. */
const MEXICO_BOUNDS = { minLat: 14.3, maxLat: 32.8, minLng: -118.6, maxLng: -86.5 };

/** A geocoded place (Google Places), with city and state for fast filters. */
export const placeSchema = z
  .object({
    address: requiredText(300),
    city: requiredText(120),
    state: requiredText(120),
    lat: z.number({ error: m.outsideMexico }),
    lng: z.number({ error: m.outsideMexico }),
    placeId: optionalText(300),
  })
  .refine(
    ({ lat, lng }) =>
      lat >= MEXICO_BOUNDS.minLat &&
      lat <= MEXICO_BOUNDS.maxLat &&
      lng >= MEXICO_BOUNDS.minLng &&
      lng <= MEXICO_BOUNDS.maxLng,
    { error: m.outsideMexico, path: ['lat'], ...onlyWhenValid },
  );
export type PlaceInput = z.input<typeof placeSchema>;

/** A time window; `end` must be after `start`. */
export const timeWindowSchema = z
  .object({ start: dateTimeField, end: dateTimeField })
  .refine(({ start, end }) => Date.parse(end) > Date.parse(start), {
    error: m.windowOrder,
    path: ['end'],
    ...onlyWhenValid,
  });
