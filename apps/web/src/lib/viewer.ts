import type { createServerClient } from '@supabase/ssr';
import {
  sessionAuthTimes,
  TERMS_VERSION,
  type SessionAuthTimes,
  type Database,
  type UserRole,
  type VerificationStatus,
} from '@transport/shared';

export type Supabase = ReturnType<typeof createServerClient<Database>>;

/** The signed-in user with their profile and company, as RLS lets them see it. */
export interface ViewerDetails {
  userId: string;
  role: UserRole;
  fullName: string | null;
  company: {
    id: string;
    legalName: string;
    rfc: string;
    status: VerificationStatus;
    statusReason: string | null;
    /** A hombre-camión (D13): the Gerente also drives. */
    isOwnerOperator: boolean;
  } | null;
  /** Whether the account accepted the current version of the terms (I1). */
  termsAccepted: boolean;
  /** `aal2` once the session confirmed the second factor (R5, D46). */
  aal: 'aal1' | 'aal2';
  /** The Auth session (the JWT's `session_id`), or null when the claim is missing. */
  sessionId: string | null;
  /** When the session was authenticated (the JWT's `amr`), for its limits (D46). */
  authTimes: SessionAuthTimes | null;
}

/**
 * Loads the current user. `getClaims` verifies the JWT (never trust the
 * cookie's session as-is on the server); the profile comes through RLS.
 */
export async function loadViewer(supabase: Supabase): Promise<ViewerDetails | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  if (error || !claims || !userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'role, full_name, company:companies(id, legal_name, rfc, status, status_reason, is_owner_operator), terms_acceptances(terms_version)',
    )
    .eq('id', userId)
    .eq('terms_acceptances.terms_version', TERMS_VERSION)
    .maybeSingle();
  if (!profile) return null;

  const { company } = profile;
  return {
    userId,
    role: profile.role,
    fullName: profile.full_name,
    company: company && {
      id: company.id,
      legalName: company.legal_name,
      rfc: company.rfc,
      status: company.status,
      statusReason: company.status_reason,
      isOwnerOperator: company.is_owner_operator,
    },
    termsAccepted: profile.terms_acceptances.length > 0,
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    sessionId: typeof claims.session_id === 'string' ? claims.session_id : null,
    authTimes: sessionAuthTimes(claims.amr),
  };
}
