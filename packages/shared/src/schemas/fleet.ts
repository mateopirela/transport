import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { LICENSE_TYPES, UNIT_TYPES } from '../enums';
import { CITY_PRESETS, mexicoCityDateTime } from '../fleet';
import {
  emailField,
  enumField,
  enumList,
  formError,
  onlyWhenValid,
  optionalText,
  phoneField,
  requiredText,
} from './common';
import { todayInMexicoCity } from './operator';

const CITY_IDS = CITY_PRESETS.map((c) => c.id) as [string, ...string[]];

/** Empty strings from optional text inputs become `undefined`. */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Operator form schema. A new license date must not be expired; when editing,
 * `keptLicenseExpiresOn` (the date already saved) is accepted as is, so an
 * expired license does not block editing other fields (assign_trip still
 * refuses an operator with an expired license, D16).
 */
export function operatorDraftSchemaFor(keptLicenseExpiresOn?: string | null) {
  return z.object(
    {
      fullName: requiredText(160),
      // Optional since G2: operators sign in with their phone (D15-E1).
      email: z.preprocess(blankToUndefined, emailField.optional()),
      phone: z.preprocess(blankToUndefined, phoneField.optional()),
      licenseNumber: z.preprocess(
        blankToUndefined,
        z
          .string({ error: m.invalidText })
          .transform((value) => value.toUpperCase().replace(/\s/gu, ''))
          .pipe(z.string().max(30, { error: m.tooLong(30) }))
          .optional(),
      ),
      licenseType: enumField(LICENSE_TYPES).optional(),
      licenseExpiresOn: z.preprocess(
        blankToUndefined,
        z.iso
          .date({ error: m.date })
          .refine((date) => date === keptLicenseExpiresOn || date >= todayInMexicoCity(), {
            error: m.licenseExpired,
          })
          .optional(),
      ),
    },
    formError,
  );
}

/**
 * Operator registered by the carrier to invite it (B18). Only the name is
 * needed to send the invitation link (G2: the operator brings their phone);
 * the email and the license can be completed later.
 */
export const operatorDraftSchema = operatorDraftSchemaFor();

export type OperatorDraftInput = z.input<typeof operatorDraftSchema>;
export type OperatorDraftValues = z.output<typeof operatorDraftSchema>;

/** Where and from when a unit is free (input of set_vehicle_availability). */
export const availabilityFormSchema = z
  .object(
    {
      cityId: enumField(CITY_IDS),
      date: z.string({ error: m.date }),
      time: z.string({ error: m.time }),
    },
    formError,
  )
  .transform((value, ctx) => {
    const availableFrom = mexicoCityDateTime(value.date, value.time);
    if (!availableFrom) {
      ctx.addIssue({ code: 'custom', message: m.dateTime, path: ['date'] });
      return z.NEVER;
    }
    return { cityId: value.cityId, availableFrom };
  });

export type AvailabilityFormValues = z.output<typeof availabilityFormSchema>;

/** A usual route of the carrier between two cities. */
export const carrierRouteFormSchema = z
  .object(
    {
      originId: enumField(CITY_IDS),
      destinationId: enumField(CITY_IDS),
      unitTypes: enumList(UNIT_TYPES).default([]),
      notes: optionalText(500),
    },
    formError,
  )
  .refine((route) => route.originId !== route.destinationId, {
    error: m.sameOriginDestination,
    path: ['destinationId'],
    ...onlyWhenValid,
  });

export type CarrierRouteFormValues = z.output<typeof carrierRouteFormSchema>;

/** Expiry date typed for a document (YYYY-MM-DD), optional. */
export const documentExpirySchema = z.preprocess(
  blankToUndefined,
  z.iso
    .date({ error: m.date })
    .refine((date) => date >= todayInMexicoCity(), { error: m.documentExpired })
    .optional(),
);
