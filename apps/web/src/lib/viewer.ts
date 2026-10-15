import type { createServerClient } from '@supabase/ssr';
import type { Database, UserRole, VerificationStatus } from '@transport/shared';

export type Supabase = ReturnType<typeof createServerClient<Database>>;

/** The signed-in user with their profile and company, as RLS lets them see it. */
export interface ViewerDetails {
  userId: string;
  role: UserRole;
  fullName: string | null;
  company: {
    id: string;
    legalName: string;
    status: VerificationStatus;
    statusReason: string | null;
  } | null;
}

/**
 * Loads the current user. `getClaims` verifies the JWT (never trust the
 * cookie's session as-is on the server); the profile comes through RLS.
 */
export async function loadViewer(supabase: Supabase): Promise<ViewerDetails | null> {
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, company:companies(id, legal_name, status, status_reason)')
    .eq('id', userId)
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
      status: company.status,
      statusReason: company.status_reason,
    },
  };
}
