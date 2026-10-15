import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { CARGO_TYPES, SPECIAL_REQUIREMENTS, UNIT_TYPES } from '../enums';
import {
  amountCentsField,
  enumField,
  enumList,
  onlyWhenValid,
  optionalText,
  placeSchema,
  positiveNumber,
  requiredText,
  timeWindowSchema,
} from './common';

/** ~1 km: closer than this, origin and destination are treated as the same place. */
const SAME_PLACE_DEGREES = 0.01;

/** Form to create or edit a load (shipper web). */
export const loadFormSchema = z
  .object({
    origin: placeSchema,
    destination: placeSchema,
    pickupWindow: timeWindowSchema,
    deliveryWindow: timeWindowSchema,
    cargoType: enumField(CARGO_TYPES),
    description: requiredText(500),
    weightKg: positiveNumber(80_000),
    volumeM3: positiveNumber(200).optional(),
    unitType: enumField(UNIT_TYPES),
    specialRequirements: enumList(SPECIAL_REQUIREMENTS).default([]),
    proposedPriceCents: amountCentsField,
    notes: optionalText(1000),
  })
  .refine(
    ({ pickupWindow, deliveryWindow }) =>
      Date.parse(deliveryWindow.end) > Date.parse(pickupWindow.start),
    { error: m.deliveryBeforePickup, path: ['deliveryWindow', 'end'], ...onlyWhenValid },
  )
  .refine(
    ({ origin, destination }) =>
      Math.abs(origin.lat - destination.lat) >= SAME_PLACE_DEGREES ||
      Math.abs(origin.lng - destination.lng) >= SAME_PLACE_DEGREES,
    { error: m.sameOriginDestination, path: ['destination'], ...onlyWhenValid },
  );

export type LoadFormInput = z.input<typeof loadFormSchema>;
export type LoadFormValues = z.output<typeof loadFormSchema>;
