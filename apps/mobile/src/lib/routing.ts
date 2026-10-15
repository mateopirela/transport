import type { UserRole, VerificationStatus } from '@transport/shared';

// Where a user may be, decided only from the session and their profile. The
// server still enforces everything through RLS; this just keeps the UI on the
// right screens (D06: shippers and admins use the web app).

export interface ProfileSnapshot {
  role: UserRole;
  companyId: string | null;
  companyStatus: VerificationStatus | null;
}

export type SessionSnapshot =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; profile: ProfileSnapshot | null; profileError: boolean };

export type Area =
  | 'loading'
  | 'auth'
  | 'company_setup'
  | 'join'
  | 'carrier'
  | 'operator'
  | 'unsupported'
  | 'problem';

export function resolveArea(snapshot: SessionSnapshot): Area {
  if (snapshot.status === 'loading') return 'loading';
  if (snapshot.status === 'signed_out') return 'auth';
  const { profile, profileError } = snapshot;
  if (!profile) return profileError ? 'problem' : 'loading';

  switch (profile.role) {
    case 'carrier':
      return profile.companyId ? 'carrier' : 'company_setup';
    case 'operator':
      return profile.companyId ? 'operator' : 'join';
    case 'shipper':
    case 'admin':
      return 'unsupported';
  }
}

/** Top-level route segments each area may show, and where it starts. */
const AREA_ROUTES: Record<
  Exclude<Area, 'loading'>,
  { home: string; segments: readonly string[] }
> = {
  auth: { home: '/sign-in', segments: ['(auth)', 'invite'] },
  join: { home: '/invite', segments: ['invite'] },
  company_setup: { home: '/company', segments: ['company'] },
  carrier: { home: '/home', segments: ['(carrier)'] },
  operator: { home: '/trip', segments: ['(operator)'] },
  unsupported: { home: '/unsupported', segments: ['unsupported'] },
  problem: { home: '/problem', segments: ['problem'] },
};

/** Routes reachable in any area: the e-mail confirmation deep link lands here. */
const ALWAYS_ALLOWED = new Set(['auth']);

/**
 * The route to replace the current one with, or null to stay. `segments` are
 * expo-router's `useSegments()` (e.g. `['(carrier)', 'home']`, `[]` for `/`).
 */
export function redirectFor(area: Area, segments: readonly string[]): string | null {
  if (area === 'loading') return null;
  const first = segments[0];
  if (first !== undefined && ALWAYS_ALLOWED.has(first)) return null;
  const { home, segments: allowed } = AREA_ROUTES[area];
  return first !== undefined && allowed.includes(first) ? null : home;
}
