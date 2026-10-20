// Forms of the admin road catalog (H4, D31). Every figure needs its source
// and date (H.0.5); the RPCs (admin_upsert_road_segment, …) validate again.
import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { ROAD_DATA_STATUSES, ROAD_RISK_LEVELS, TOLL_VEHICLE_CLASSES } from '../roads/catalog';
import { enumField, onlyWhenValid, optionalText, requiredText, uuidField } from './common';
import { todayInMexicoCity } from './operator';

const ROAD_CODE = /^[A-Z0-9][A-Z0-9-]{1,39}$/u;

const roadCode = z
  .string({ error: m.roadCode })
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(ROAD_CODE, { error: m.roadCode }));

/** A number typed in a form (text) within a range; blank or garbage is refused. */
const decimal = (min: number, max: number, error: string) =>
  z
    .string({ error })
    .trim()
    .regex(/^-?\d+(\.\d+)?$/u, { error })
    .transform(Number)
    .refine((n) => n >= min && n <= max, { error });

/** A whole number typed in a form within a range. */
const wholeNumber = (min: number, max: number, error: string) =>
  z
    .string({ error })
    .trim()
    .regex(/^\d+$/u, { error })
    .transform(Number)
    .refine((n) => n >= min && n <= max, { error });

const sourceUrl = z
  .string({ error: m.httpsUrl })
  .trim()
  .max(500, { error: m.tooLong(500) })
  .regex(/^https:\/\/\S+$/u, { error: m.httpsUrl })
  .optional();

const sourceFields = {
  source: requiredText(300),
  sourceUrl,
  dataStatus: enumField(ROAD_DATA_STATUSES),
};

/** A calendar date (YYYY-MM-DD) not after today in Mexico City. */
const pastDate = z.iso
  .date({ error: m.date })
  .refine((value) => value <= todayInMexicoCity(), { error: m.notFuture });

const latitude = decimal(-90, 90, m.coordinate);
const longitude = decimal(-180, 180, m.coordinate);

export const roadSegmentFormSchema = z.object(
  {
    id: uuidField.optional(),
    code: roadCode,
    name: requiredText(120),
    highway: optionalText(40),
    fromCity: requiredText(120),
    fromState: requiredText(60),
    fromLat: latitude,
    fromLng: longitude,
    toCity: requiredText(120),
    toState: requiredText(60),
    toLat: latitude,
    toLng: longitude,
    distanceKm: decimal(0.1, 3000, m.positiveNumber),
    isToll: z.boolean().default(false),
    notes: optionalText(1000),
    sourceDate: pastDate,
    archived: z.boolean().default(false),
    ...sourceFields,
  },
  { error: m.required },
);
export type RoadSegmentFormInput = z.input<typeof roadSegmentFormSchema>;
export type RoadSegmentFormValues = z.output<typeof roadSegmentFormSchema>;

export const segmentTollFormSchema = z.object(
  {
    segmentId: uuidField,
    vehicleClass: enumField(TOLL_VEHICLE_CLASSES),
    /** Null: the class is charged but the tariff is unknown ("Sin dato"). */
    amountCents: z
      .int({ error: m.amount })
      .min(0, { error: m.amount })
      .max(10_000_000, { error: m.amountTooHigh })
      .nullable(),
    validFrom: z.iso.date({ error: m.date }),
    ...sourceFields,
  },
  { error: m.required },
);
export type SegmentTollFormValues = z.output<typeof segmentTollFormSchema>;

export const segmentRiskFormSchema = z
  .object(
    {
      id: uuidField.optional(),
      segmentId: uuidField,
      level: enumField(ROAD_RISK_LEVELS),
      fromHour: wholeNumber(0, 23, m.hourBand),
      toHour: wholeNumber(1, 24, m.hourBand),
      description: requiredText(300),
      observedOn: pastDate,
      archived: z.boolean().default(false),
      ...sourceFields,
    },
    { error: m.required },
  )
  .refine((risk) => risk.fromHour !== risk.toHour, {
    error: m.hourBand,
    path: ['toHour'],
    ...onlyWhenValid,
  });
export type SegmentRiskFormValues = z.output<typeof segmentRiskFormSchema>;

export const corridorFormSchema = z.object(
  {
    id: uuidField.optional(),
    code: roadCode,
    name: requiredText(120),
    originCity: requiredText(120),
    originState: requiredText(60),
    originLat: latitude,
    originLng: longitude,
    originRadiusKm: decimal(1, 300, m.positiveNumber),
    destinationCity: requiredText(120),
    destinationState: requiredText(60),
    destinationLat: latitude,
    destinationLng: longitude,
    destinationRadiusKm: decimal(1, 300, m.positiveNumber),
    bidirectional: z.boolean().default(true),
    /** Codes of the segments, in order, separated by commas or spaces. */
    segmentCodes: z
      .string({ error: m.roadSegments })
      .transform((value) =>
        value
          .split(/[,\s]+/u)
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.string().regex(ROAD_CODE, { error: m.roadCode }))
          .min(1, { error: m.roadSegments }),
      ),
    archived: z.boolean().default(false),
  },
  { error: m.required },
);
export type CorridorFormValues = z.output<typeof corridorFormSchema>;
