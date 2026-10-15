import 'server-only';

import { companyFormSchema, type CompanyFormValues } from '@transport/shared';

import { authErrorKey, type AuthErrorKey } from '../auth-errors';
import { paths } from '../routing';
import type { Supabase } from '../viewer';

/**
 * Key in the user metadata where the sign-up keeps the company data until the
 * email is confirmed and there is a session to call `create_company` with.
 * The metadata is user-controlled: it is re-validated here and the RPC
 * validates again (role, one company per user).
 */
export const PENDING_COMPANY_KEY = 'pending_company';

/** Creates the caller's company through the `create_company` RPC (B01). */
export async function createCompany(
  supabase: Supabase,
  company: CompanyFormValues,
): Promise<{ error?: AuthErrorKey }> {
  const { error } = await supabase.rpc('create_company', {
    p_legal_name: company.legalName,
    p_rfc: company.rfc,
    p_contact_name: company.contactName,
    p_contact_email: company.contactEmail,
    p_contact_phone: company.contactPhone,
  });
  if (error) return { error: authErrorKey(error) };
  // Best effort: a stale copy is harmless because the RPC refuses a second company.
  await supabase.auth.updateUser({ data: { [PENDING_COMPANY_KEY]: null } });
  return {};
}

/** The company data saved at sign-up, if it is still pending and valid. */
export async function pendingCompany(
  supabase: Supabase,
): Promise<{ userId: string; company: CompanyFormValues } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const parsed = companyFormSchema.safeParse(data.user.user_metadata[PENDING_COMPANY_KEY]);
  return parsed.success ? { userId: data.user.id, company: parsed.data } : null;
}

/**
 * After the first sign-in (email confirmed), registers the company saved at
 * sign-up. Returns the error key when it fails (e.g. a taken RFC), so the
 * caller can send the user to /completar-registro with the reason.
 */
export async function registerPendingCompany(supabase: Supabase): Promise<AuthErrorKey | null> {
  const pending = await pendingCompany(supabase);
  if (!pending) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', pending.userId)
    .maybeSingle();
  if (profile?.role !== 'shipper' || profile.company_id) return null;
  const { error } = await createCompany(supabase, pending.company);
  return error ?? null;
}

/** /completar-registro showing why the automatic registration failed. */
export function completeCompanyPath(error: AuthErrorKey): string {
  return `${paths.completeCompany}?error=${error}`;
}
