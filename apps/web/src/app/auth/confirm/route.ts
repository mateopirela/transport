import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { completeCompanyPath, registerPendingCompany } from '@/lib/auth/company';
import { paths, safeNextPath } from '@/lib/routing';
import { createClient } from '@/lib/supabase/server';

/** Link types this app sends: sign-up confirmation and password recovery. */
const OTP_TYPES = new Set<EmailOtpType>(['signup', 'email', 'recovery']);

/**
 * The `next` of the sign-up's `emailRedirectTo` (`<site>/auth/confirm?next=…`),
 * which the confirmation template passes along as `redirect_to` (G2: a
 * Coordinador returns to their invitation link). Only a relative path is
 * kept (safeNextPath), so the redirect never leaves the site.
 */
function nextFromRedirect(redirectTo: string | null): string | null {
  if (!redirectTo) return null;
  try {
    return new URL(redirectTo).searchParams.get('next');
  } catch {
    return null;
  }
}

/**
 * Landing of the links in auth emails. Supports the token-hash links of the
 * templates in supabase/templates (work from any browser) and the default
 * PKCE `code` links. On success the user has a session.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const code = params.get('code');
  const next =
    safeNextPath(params.get('next') ?? nextFromRedirect(params.get('redirect_to'))) ?? paths.home;

  const supabase = await createClient();
  let ok = false;
  if (supabase && tokenHash && type && OTP_TYPES.has(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (supabase && code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  // Relative redirects keep the host the user came from (and its cookies).
  if (!supabase || !ok) redirect(`${paths.signIn}?error=enlace`);
  // A recovery link always ends on the password form, whatever the company
  // state: PKCE recovery links carry `code` without `type`, so check `next` too.
  const isRecovery = type === 'recovery' || next === paths.resetPassword;
  if (!isRecovery) {
    const companyError = await registerPendingCompany(supabase);
    if (companyError) redirect(completeCompanyPath(companyError));
  }
  redirect(next);
}
