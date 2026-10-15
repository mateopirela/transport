// Route access rules for the web app (Cliente and Admin, D06). Pure, so the
// proxy (optimistic redirects) and the layouts (authoritative checks) share
// one definition and it can be unit-tested. Data access itself is enforced
// by RLS in Postgres; this only decides which screens a user may open.
import type { UserRole, VerificationStatus } from '@transport/shared';

export const paths = {
  home: '/',
  signIn: '/login',
  signUp: '/registro',
  forgotPassword: '/recuperar',
  checkEmail: '/verificar-correo',
  resetPassword: '/restablecer',
  completeCompany: '/completar-registro',
  review: '/cuenta-en-revision',
  shipper: '/cliente',
  admin: '/admin',
  mobileOnly: '/solo-app',
} as const;

/** The signed-in user as far as routing is concerned; `null` when signed out. */
export type Viewer = {
  role: UserRole;
  company: { status: VerificationStatus } | null;
} | null;

/** Screens for signed-out visitors; a signed-in user is sent to their home. */
const GUEST_ONLY = [paths.signIn, paths.signUp, paths.forgotPassword, paths.checkEmail];

/** Open to everyone: auth callbacks must work with or without a session. */
const PUBLIC = ['/auth'];

/** Areas that only one kind of user may open: their home. */
const HOME_ONLY = [paths.shipper, paths.review, paths.completeCompany, paths.mobileOnly] as const;

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Where a signed-in user lands. */
export function homeFor(viewer: NonNullable<Viewer>): string {
  switch (viewer.role) {
    case 'admin':
      return paths.admin;
    case 'shipper':
      if (!viewer.company) return paths.completeCompany;
      return viewer.company.status === 'approved' ? paths.shipper : paths.review;
    case 'carrier':
    case 'operator':
      // Carriers and operators use the mobile app (D06).
      return paths.mobileOnly;
  }
}

/**
 * Decides whether `viewer` may open `pathname`. Returns `null` to allow it or
 * the path to redirect to.
 */
export function resolveRoute(pathname: string, viewer: Viewer): string | null {
  if (PUBLIC.some((base) => isUnder(pathname, base))) return null;

  if (GUEST_ONLY.some((base) => isUnder(pathname, base))) {
    return viewer ? homeFor(viewer) : null;
  }

  if (!viewer) {
    const next = pathname === paths.home ? '' : `?next=${encodeURIComponent(pathname)}`;
    return `${paths.signIn}${next}`;
  }

  const home = homeFor(viewer);
  if (pathname === paths.home) return home;
  if (isUnder(pathname, paths.admin)) return viewer.role === 'admin' ? null : home;
  for (const base of HOME_ONLY) {
    if (isUnder(pathname, base)) return home === base ? null : home;
  }
  // Anything else (e.g. /restablecer, unknown pages that render a 404).
  return null;
}

/**
 * Sanitizes a post-login `next` parameter: only same-origin relative paths
 * are accepted, so it cannot be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  const base = 'http://localhost';
  const url = new URL(next, base);
  // Normalization can turn `/a/..//evil.example` into a protocol-relative path.
  if (url.origin !== base || url.pathname.startsWith('//')) return null;
  return `${url.pathname}${url.search}`;
}
