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
    // The Gerente (manager) creates the company; a Coordinador only joins one
    // by invitation (G1b), so without a company they land on the join screen.
    case 'manager':
      return profile.companyId ? 'carrier' : 'company_setup';
    case 'coordinator':
      return profile.companyId ? 'carrier' : 'join';
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
  // `shared` is a load shared with the team (G7); `compartido` is its deep
  // link (transport://compartido/<token>), which redirects to `shared`.
  carrier: { home: '/home', segments: ['(carrier)', 'shared', 'compartido'] },
  operator: { home: '/trip', segments: ['(operator)', 'shared', 'compartido'] },
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

/** Paths of a load shared with the team (G7): `/shared/<token>` or its deep link `/compartido/<token>`. */
const SHARED_PATH = /^\/(?:shared|compartido)\/[A-Za-z0-9_-]{43}$/u;

/**
 * Like `redirectFor`, but a shared-load link opened while signed out (or
 * before the profile loads) survives the trip through sign-in: the guard
 * remembers its path in `pending` and, once the user is in an area that may
 * open it, goes there instead of the area's home; it forgets it on arrival. Returns the route to
 * replace the current one with (or null) and the path to keep remembering.
 */
export function resolveRedirect(
  area: Area,
  segments: readonly string[],
  pathname: string,
  pending: string | null,
): { target: string | null; pending: string | null } {
  const target = redirectFor(area, segments);
  if (SHARED_PATH.test(pathname)) {
    // Already on it and allowed: nothing to remember. Otherwise keep it.
    return target === null ? { target, pending: null } : { target, pending: pathname };
  }
  if (area === 'loading') return { target, pending };
  // Kept until the shared screen is reached (the first branch clears it).
  if (pending !== null && redirectFor(area, ['shared']) === null) {
    return { target: pending, pending };
  }
  return { target, pending };
}
