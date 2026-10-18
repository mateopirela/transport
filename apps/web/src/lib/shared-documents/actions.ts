'use server';

import {
  authErrors,
  PROVIDER_STATUSES,
  providerErrorMessage,
  revokeShareErrorMessage,
  sharedDocumentsCopy,
  uuidField,
  type ProviderStatus,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import type { FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';

const notConfigured: FormState = { error: authErrors.notConfigured };

function idOf(formData: FormData, key: string): string | null {
  const parsed = uuidField.safeParse(formData.get(key));
  return parsed.success ? parsed.data : null;
}

function statusOf(formData: FormData): ProviderStatus | null {
  const value = formData.get('status');
  return PROVIDER_STATUSES.find((status) => status === value) ?? null;
}

/**
 * The shipper approves, rejects or revokes a carrier as its provider (D21).
 * set_provider_status checks the shipper, the pair and the transition again.
 */
export async function setProviderStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const carrierCompanyId = idOf(formData, 'carrierCompanyId');
  const status = statusOf(formData);
  if (!carrierCompanyId || !status) return { error: sharedDocumentsCopy.errors.notAllowed };
  const notes = formData.get('notes');
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (text.length > 1000)
    return { fieldErrors: { notes: sharedDocumentsCopy.errors.notesTooLong } };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('set_provider_status', {
    p_carrier_company_id: carrierCompanyId,
    p_status: status,
    p_notes: text || undefined,
  });
  if (error) return { error: providerErrorMessage(error) };
  // The comparator, the negotiation and the trip show the status.
  revalidatePath(paths.shipper, 'layout');
  return { message: sharedDocumentsCopy.provider.saved[status] };
}

/** The manager stops sharing a document with the trip's shipper (revoke_document_share). */
export async function revokeDocumentShare(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const shareId = idOf(formData, 'shareId');
  if (!shareId) return { error: sharedDocumentsCopy.errors.shareNotFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('revoke_document_share', { p_share_id: shareId });
  if (error) return { error: revokeShareErrorMessage(error) };
  revalidatePath(paths.carrierTrips, 'layout');
  return { message: sharedDocumentsCopy.carrier.revokeDone };
}
