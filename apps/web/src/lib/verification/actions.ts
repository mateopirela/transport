'use server';

import {
  adminCopy,
  authErrors,
  companyDataSchema,
  companyReviewSchema,
  documentReviewSchema,
  endOfDayInMexicoCity,
  onboardingCopy,
  submitDocumentSchema,
  validationMessages,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import { paths } from '../routing';
import { getViewer } from '../session';
import { createClient } from '../supabase/server';
import { adminErrorMessage, onboardingErrorMessage } from './errors';

const notConfigured: FormState = { error: authErrors.notConfigured };

const toExpiresAt = (date: string | undefined) => (date ? endOfDayInMexicoCity(date) : null);

/** Statuses in which a shipper or a Gerente may still correct the company data. */
const EDITABLE = new Set(['pending_review', 'rejected']);

/**
 * Shipper or Gerente: corrects the company's name, contact and fiscal data
 * (G2) while it is in review. A persona moral (12-character RFC) must name
 * its legal representative. A Coordinador only reads it (RLS refuses the
 * update too).
 */
export async function updateCompanyContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = companyDataSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  const viewer = await getViewer();
  if (!supabase || !viewer) return notConfigured;
  const company = viewer.company;
  if (
    (viewer.role !== 'shipper' && viewer.role !== 'manager') ||
    !company ||
    !EDITABLE.has(company.status)
  ) {
    return { error: onboardingCopy.errors.notEditable, values: refillValues(entries) };
  }
  if (company.rfc.length === 12 && !parsed.data.legalRepresentativeName) {
    return {
      fieldErrors: { legalRepresentativeName: validationMessages.required },
      values: refillValues(entries),
    };
  }

  // Only these columns are granted to clients (B01, G2); RLS limits the row
  // to the caller's own company. Status and RFC never change here.
  const v = parsed.data;
  const { error } = await supabase
    .from('companies')
    .update({
      legal_name: v.legalName,
      contact_name: v.contactName,
      contact_email: v.contactEmail,
      contact_phone: v.contactPhone,
      fiscal_street: v.fiscalStreet,
      fiscal_exterior_number: v.fiscalExteriorNumber,
      fiscal_interior_number: v.fiscalInteriorNumber ?? null,
      fiscal_neighborhood: v.fiscalNeighborhood,
      fiscal_postal_code: v.fiscalPostalCode,
      fiscal_municipality: v.fiscalMunicipality,
      fiscal_state: v.fiscalState,
      legal_representative_name: v.legalRepresentativeName ?? null,
    })
    .eq('id', company.id);
  if (error) return { error: onboardingCopy.errors.generic, values: refillValues(entries) };
  revalidatePath(paths.review);
  return { message: onboardingCopy.company.saved, values: refillValues(entries) };
}

/**
 * Shipper: registers a file already uploaded to the `documents` bucket. The
 * RPC checks ownership, the requirement, the path and that the file exists.
 */
export async function registerDocument(input: unknown): Promise<{ error?: string }> {
  const parsed = submitDocumentSchema.safeParse(input);
  if (!parsed.success) return { error: onboardingCopy.errors.generic };
  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  const v = parsed.data;
  const { error } = await supabase.rpc('submit_document', {
    p_requirement_id: v.requirementId,
    p_owner_type: v.ownerType,
    p_owner_id: v.ownerId,
    p_storage_path: v.storagePath,
    p_file_name: v.fileName,
    p_expires_at: toExpiresAt(v.expiresOn) ?? undefined,
  });
  if (error) return { error: onboardingErrorMessage(error) };
  revalidatePath(paths.review);
  return {};
}

/** Shipper or Gerente: sends a rejected company back to the review queue. */
export async function requestCompanyReview(): Promise<FormState> {
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  // The RPC checks the role and that the caller's company is rejected.
  const { error } = await supabase.rpc('request_company_review');
  if (error) return { error: onboardingCopy.errors.generic };
  revalidatePath(paths.review);
  return {};
}

/** Admin: approves or rejects a document. */
export async function reviewDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = documentReviewSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const v = parsed.data;
  // The RPC is the authority: it refuses non-admins and non-pending documents.
  const { error } = await supabase.rpc('review_document', {
    p_document_id: v.documentId,
    p_decision: v.decision,
    p_notes: v.notes,
    p_expires_at: toExpiresAt(v.expiresOn) ?? undefined,
  });
  if (error) return { error: adminErrorMessage(error), values: refillValues(entries) };
  revalidatePath(paths.admin, 'layout');
  return { message: adminCopy.document.reviewed };
}

/** Admin: approves (or reactivates), rejects or suspends a company. */
export async function reviewCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = companyReviewSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const v = parsed.data;
  const { error } = await supabase.rpc('review_company', {
    p_company_id: v.companyId,
    p_decision: v.decision,
    p_notes: v.notes,
  });
  if (error) return { error: adminErrorMessage(error), values: refillValues(entries) };
  revalidatePath(paths.admin, 'layout');
  return { message: adminCopy.companyActions.done };
}
