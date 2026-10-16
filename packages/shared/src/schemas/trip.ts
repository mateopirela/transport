import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { EVIDENCE_STAGES, INCIDENT_KINDS } from '../enums';
import { mexicoCityDateTime } from '../fleet';
import { MAX_LOCATION_BATCH } from '../trips';
import {
  dateTimeField,
  enumField,
  formError,
  onlyWhenValid,
  requiredText,
  uuidField,
} from './common';

const latitude = z
  .number({ error: m.coordinates })
  .min(-90, { error: m.coordinates })
  .max(90, { error: m.coordinates });
const longitude = z
  .number({ error: m.coordinates })
  .min(-180, { error: m.coordinates })
  .max(180, { error: m.coordinates });

/** A GPS point as `record_trip_locations` reads it. */
export const locationPointSchema = z.object(
  {
    recordedAt: dateTimeField,
    lat: latitude,
    lng: longitude,
    accuracyM: z
      .number({ error: m.coordinates })
      .min(0, { error: m.coordinates })
      .max(100_000, { error: m.coordinates })
      .optional(),
    speedMps: z
      .number({ error: m.coordinates })
      .min(0, { error: m.coordinates })
      .max(100, { error: m.coordinates })
      .optional(),
    headingDeg: z
      .number({ error: m.coordinates })
      .min(0, { error: m.coordinates })
      .lt(360, { error: m.coordinates })
      .optional(),
  },
  { error: m.coordinates },
);
export type LocationPoint = z.output<typeof locationPointSchema>;

/** A batch of queued points (offline queue, B22). */
export const locationBatchSchema = z
  .array(locationPointSchema, { error: m.coordinates })
  .max(MAX_LOCATION_BATCH, { error: m.tooManyItems(MAX_LOCATION_BATCH) });

/** Optional location of an event, incident or photo: both coordinates or none. */
export const optionalCoordinatesSchema = z
  .object({ lat: latitude.optional(), lng: longitude.optional() }, { error: m.coordinates })
  .refine(({ lat, lng }) => (lat === undefined) === (lng === undefined), {
    error: m.coordinates,
    path: ['lat'],
    ...onlyWhenValid,
  });

/** Form to report an incident (input of `report_incident`). */
export const incidentFormSchema = z.object(
  {
    kind: enumField(INCIDENT_KINDS),
    description: requiredText(2000),
  },
  formError,
);
export type IncidentFormValues = z.output<typeof incidentFormSchema>;

/** Admin resolution of an incident, or cancellation of a trip: a reason is required. */
export const incidentResolutionSchema = z.object({ resolution: requiredText(2000) }, formError);
export const cancelTripSchema = z.object({ reason: requiredText(1000) }, formError);

/** Metadata of an evidence photo (input of `add_trip_evidence`). */
export const evidenceMetadataSchema = z
  .object(
    {
      stage: enumField(EVIDENCE_STAGES),
      sha256: z.string({ error: m.fileHash }).regex(/^[0-9a-f]{64}$/u, { error: m.fileHash }),
      capturedAt: dateTimeField,
      incidentId: uuidField.optional(),
    },
    formError,
  )
  .refine(({ stage, incidentId }) => (stage === 'incident') === (incidentId !== undefined), {
    error: m.required,
    path: ['incidentId'],
    ...onlyWhenValid,
  });
export type EvidenceMetadata = z.output<typeof evidenceMetadataSchema>;

/**
 * Estimated end of unloading typed by the operator (date and time in Mexico
 * City), as an ISO timestamp. The range against the current moment is
 * checked with `unloadEstimateProblem`.
 */
export const unloadEstimateFormSchema = z
  .object(
    {
      date: z.string({ error: m.date }),
      time: z.string({ error: m.time }),
    },
    formError,
  )
  .transform((value, ctx) => {
    const estimatedEndAt = mexicoCityDateTime(value.date, value.time);
    if (!estimatedEndAt) {
      ctx.addIssue({ code: 'custom', message: m.dateTime, path: ['date'] });
      return z.NEVER;
    }
    return { estimatedEndAt };
  });
export type UnloadEstimateFormValues = z.output<typeof unloadEstimateFormSchema>;
