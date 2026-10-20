import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { SPECIAL_REQUIREMENTS, UNIT_TYPES, VEHICLE_KINDS } from '../enums';
import {
  enumField,
  enumList,
  formError,
  onlyWhenValid,
  optionalText,
  positiveNumber,
} from './common';

const MIN_MODEL_YEAR = 1950;

/** Form to register a tractor, rigid truck or trailer (carrier app). */
export const vehicleFormSchema = z
  .object(
    {
      kind: enumField(VEHICLE_KINDS),
      plate: z
        .string({ error: m.plate })
        .transform((value) => value.toUpperCase().replace(/[\s-]/gu, ''))
        .pipe(z.string().regex(/^[A-Z\d]{5,8}$/u, { error: m.plate })),
      /** Fleet number the carrier uses internally ("número económico"). */
      fleetNumber: optionalText(30),
      modelYear: z
        .int({ error: m.vehicleYear })
        .min(MIN_MODEL_YEAR, { error: m.vehicleYear })
        .refine((year) => year <= new Date().getFullYear() + 1, { error: m.vehicleYear })
        .optional(),
      // Body and capacity belong to the unit that carries the cargo: required for
      // rigid trucks and trailers, absent for tractors.
      unitType: enumField(UNIT_TYPES).optional(),
      capacityKg: positiveNumber(80_000).optional(),
      capacityM3: positiveNumber(200).optional(),
      features: enumList(SPECIAL_REQUIREMENTS).default([]),
      /** Axles of the truck with its trailer (H4): pick the toll class; empty = the default. */
      axleCount: z
        .int({ error: m.axleCount })
        .min(2, { error: m.axleCount })
        .max(9, { error: m.axleCount })
        .optional(),
    },
    formError,
  )
  .superRefine((vehicle, ctx) => {
    if (vehicle.kind === 'tractor') {
      for (const field of ['unitType', 'capacityKg', 'capacityM3'] as const) {
        if (vehicle[field] !== undefined) {
          ctx.addIssue({ code: 'custom', message: m.tractorNoBody, path: [field] });
        }
      }
      return;
    }
    if (vehicle.unitType === undefined) {
      ctx.addIssue({ code: 'custom', message: m.unitTypeRequired, path: ['unitType'] });
    }
    if (vehicle.capacityKg === undefined) {
      ctx.addIssue({ code: 'custom', message: m.capacityRequired, path: ['capacityKg'] });
    }
  }, onlyWhenValid);

export type VehicleFormInput = z.input<typeof vehicleFormSchema>;
export type VehicleFormValues = z.output<typeof vehicleFormSchema>;
