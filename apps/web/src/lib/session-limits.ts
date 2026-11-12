// Web session limits (R5, D46): the admin's session ends 8 h after signing in
// or after 30 minutes without a request; everybody else's after 30 days
// (SESSION_LIMITS in @transport/shared). The proxy checks them on every
// request and signs out with Supabase; requireAccess repeats the check.
// The last request of an admin lives in an httpOnly cookie tied to the Auth
// session. The authoritative version is the `timebox` and
// `inactivity_timeout` of Supabase Auth, a step for Mateo (docs/seguridad.md).
import { sessionEnd, sessionLimitsFor, type SessionEnd, type UserRole } from '@transport/shared';

import { paths } from './routing';
import type { ViewerDetails } from './viewer';

/** Last request of the session, as `<session id>.<epoch ms>`. */
export const ACTIVITY_COOKIE = 'transport-activity';

/** Query parameter of /login that says why the session ended. */
export const SESSION_END_PARAM = 'sesion';

const SESSION_END_VALUES: Record<SessionEnd, string> = { idle: 'inactiva', expired: 'expirada' };

/** The reason in /login?sesion=…, or null for anything else. */
export function sessionEndFromParam(value: unknown): SessionEnd | null {
  if (value === SESSION_END_VALUES.idle) return 'idle';
  if (value === SESSION_END_VALUES.expired) return 'expired';
  return null;
}

/** The sign-in page after a session ended, back to `pathname` afterwards. */
export function signInAfterSessionEnd(end: SessionEnd, pathname: string): string {
  const query = new URLSearchParams({ [SESSION_END_PARAM]: SESSION_END_VALUES[end] });
  if (pathname !== paths.home && pathname !== paths.signIn) query.set('next', pathname);
  return `${paths.signIn}?${query.toString()}`;
}

/** Whether the web keeps the last request of this role (only when idleness ends it). */
export function tracksActivity(role: UserRole): boolean {
  return sessionLimitsFor(role).idleMs !== null;
}

export function activityCookieValue(sessionId: string, now: number): string {
  return `${sessionId}.${now}`;
}

/** Options of the activity cookie: never readable by scripts, gone with the admin's session. */
export function activityCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(sessionLimitsFor('admin').maxAgeMs / 1000),
  };
}

/**
 * The last request recorded for `sessionId`, or null when the cookie is
 * missing, malformed, of another session or from the future.
 */
export function lastActivityAt(
  cookie: string | undefined,
  sessionId: string | null,
  now: number,
): number | null {
  if (!cookie || !sessionId) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot <= 0 || cookie.slice(0, dot) !== sessionId) return null;
  const digits = cookie.slice(dot + 1);
  if (!/^\d{1,15}$/u.test(digits)) return null;
  const at = Number(digits);
  return at <= now ? at : null;
}

/** Whether the viewer's session has to end now (D46), and why. */
export function viewerSessionEnd(
  viewer: Pick<ViewerDetails, 'role' | 'sessionId' | 'authTimes'>,
  activityCookie: string | undefined,
  now: number,
): SessionEnd | null {
  return sessionEnd({
    role: viewer.role,
    authTimes: viewer.authTimes,
    lastActivityAt: lastActivityAt(activityCookie, viewer.sessionId, now),
    now,
  });
}
