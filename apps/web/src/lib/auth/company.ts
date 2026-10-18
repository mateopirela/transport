import 'server-only';

import {
  companyRegistrationSchema,
  registerCompanyPayload,
  type CompanyRegistrationValues,
} from '@transport/shared';

import { authErrorKey, type AuthErrorKey } from '../auth-errors';
import { paths } from '../routing';
import type { Supabase } from '../viewer';

/**
 * Key in the user metadata where the sign-up keeps the company registration
 * (kind, fiscal data and contact, G2) until the email is confirmed and there
 * is a session to call `register_company` with. The metadata is
 * user-controlled: it is re-validated here and the RPC validates again
 * (role against kind, one company per user, RFC, address).
 */
export const PENDING_COMPANY_KEY = 'pending_company';

/** Registers the caller's company through the `register_company` RPC (G2). */
export async function registerCompany(
  supabase: Supabase,
  company: CompanyRegistrationValues,
): Promise<{ error?: AuthErrorKey }> {
  const { error } = await supabase.rpc('register_company', {
    p_payload: registerCompanyPayload(company),
  });
  if (error) return { error: authErrorKey(error) };
  // Best effort: a stale copy is harmless because the RPC refuses a second company.
  await supabase.auth.updateUser({ data: { [PENDING_COMPANY_KEY]: null } });
  return {};
}

/** The company registration saved at sign-up, if it is still pending and valid. */
export async function pendingCompany(
  supabase: Supabase,
): Promise<{ userId: string; company: CompanyRegistrationValues } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const parsed = companyRegistrationSchema.safeParse(data.user.user_metadata[PENDING_COMPANY_KEY]);
  return parsed.success ? { userId: data.user.id, company: parsed.data } : null;
}

/**
 * After the first sign-in (email confirmed), registers the company saved at
 * sign-up (a shipper or a Gerente). Returns the error key when it fails
 * (e.g. a taken RFC), so the caller can send the user to
 * /completar-registro with the reason.
 */
export async function registerPendingCompany(supabase: Supabase): Promise<AuthErrorKey | null> {
  const pending = await pendingCompany(supabase);
  if (!pending) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', pending.userId)
    .maybeSingle();
  if (!profile || profile.company_id) return null;
  if (profile.role !== 'shipper' && profile.role !== 'manager') return null;
  const { error } = await registerCompany(supabase, pending.company);
  return error ?? null;
}

/** /completar-registro showing why the automatic registration failed. */
export function completeCompanyPath(error: AuthErrorKey): string {
  return `${paths.completeCompany}?error=${error}`;
}
