import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { DOCUMENT_OWNER_TYPES } from '../verification';
import {
  emailField,
  enumField,
  formError,
  onlyWhenValid,
  optionalText,
  phoneField,
  requiredText,
  uuidField,
} from './common';

/** Calendar date (YYYY-MM-DD) that exists. */
const calendarDate = z.iso.date({ error: m.date });

const reviewNotes = optionalText(2000);

/** Registers an uploaded file as a document (input of `submit_document`). */
export const submitDocumentSchema = z.object(
  {
    requirementId: uuidField,
    ownerType: enumField(DOCUMENT_OWNER_TYPES),
    ownerId: uuidField,
    storagePath: z.string({ error: m.required }).min(1, { error: m.required }).max(300),
    fileName: optionalText(255),
    expiresOn: calendarDate.optional(),
  },
  formError,
);
export type SubmitDocumentValues = z.output<typeof submitDocumentSchema>;

/** Admin decision on a document (input of `review_document`). */
export const documentReviewSchema = z
  .object(
    {
      documentId: uuidField,
      decision: enumField(['approve', 'reject']),
      notes: reviewNotes,
      expiresOn: calendarDate.optional(),
    },
    formError,
  )
  .refine((v) => v.decision !== 'reject' || v.notes !== undefined, {
    error: m.reasonRequired,
    path: ['notes'],
    ...onlyWhenValid,
  });
export type DocumentReviewValues = z.output<typeof documentReviewSchema>;

/**
 * Admin decision on a company (input of `review_company`). Reactivating a
 * suspended company is an `approve`. Rejecting and suspending need a reason.
 */
export const companyReviewSchema = z
  .object(
    {
      companyId: uuidField,
      decision: enumField(['approve', 'reject', 'suspend']),
      notes: reviewNotes,
    },
    formError,
  )
  .refine((v) => v.decision === 'approve' || v.notes !== undefined, {
    error: m.reasonRequired,
    path: ['notes'],
    ...onlyWhenValid,
  });
export type CompanyReviewValues = z.output<typeof companyReviewSchema>;

/** Contact data a shipper may correct while the company is in review. */
export const companyContactSchema = z.object(
  {
    legalName: requiredText(200),
    contactName: requiredText(120),
    contactEmail: emailField,
    contactPhone: phoneField,
  },
  formError,
);
export type CompanyContactValues = z.output<typeof companyContactSchema>;
