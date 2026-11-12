// Access security (R5, D46): the values of the account lock and of the web
// session, and the pure rules that use them. The lock itself is enforced by
// the Auth hooks in Postgres (20261112200000_auth_hardening.sql, the same
// numbers); the session limits by the web (apps/web/src/proxy.ts).
import { z } from 'zod';

import { secondFactorCopy } from './copy/auth-security';
import type { UserRole } from './enums';

/**
 * Temporary lock per account: after `maxFailures` failed passwords (or
 * second-factor codes) in a row within `windowMinutes`, the account is
 * refused for `lockMinutes`, right password or not. A success resets it.
 */
export const LOGIN_LOCKOUT = { maxFailures: 5, windowMinutes: 15, lockMinutes: 15 } as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface SessionLimits {
  /** Since the sign-in (the first authentication of the session). */
  maxAgeMs: number;
  /** Since the last request, or null when idleness does not end the session. */
  idleMs: number | null;
}

/**
 * Web sessions (D46): the admin's ends 8 h after signing in or after 30
 * minutes without activity; everybody else's lasts 30 days, so a carrier on
 * the road is never cut off in the middle of a trip.
 */
export const SESSION_LIMITS = {
  admin: { maxAgeMs: 8 * HOUR_MS, idleMs: 30 * MINUTE_MS },
  default: { maxAgeMs: 30 * DAY_MS, idleMs: null },
} as const satisfies Record<string, SessionLimits>;

export function sessionLimitsFor(role: UserRole): SessionLimits {
  return role === 'admin' ? SESSION_LIMITS.admin : SESSION_LIMITS.default;
}

/** When the session was authenticated, from the JWT's `amr` claim (ms). */
export interface SessionAuthTimes {
  /** The first authentication (the sign-in). */
  firstAt: number;
  /** The latest one (e.g. the second factor after the password). */
  lastAt: number;
}

/**
 * Reads the `amr` claim of a Supabase JWT ([{ method, timestamp }], the
 * timestamp in seconds). Null when it is missing or has no valid entry.
 */
export function sessionAuthTimes(amr: unknown): SessionAuthTimes | null {
  if (!Array.isArray(amr)) return null;
  const times = amr
    .map((entry: unknown) =>
      typeof entry === 'object' && entry !== null
        ? (entry as { timestamp?: unknown }).timestamp
        : undefined,
    )
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((seconds) => seconds * 1000);
  if (times.length === 0) return null;
  return { firstAt: Math.min(...times), lastAt: Math.max(...times) };
}

export type SessionEnd = 'expired' | 'idle';

/**
 * Whether a session has to end now, and why. `lastActivityAt` is the last
 * request the web saw for this session (null when unknown: the latest
 * authentication counts instead). Without authentication times an admin's
 * session ends (it cannot be checked); anybody else's goes on.
 */
export function sessionEnd(input: {
  role: UserRole;
  authTimes: SessionAuthTimes | null;
  lastActivityAt: number | null;
  now: number;
}): SessionEnd | null {
  const limits = sessionLimitsFor(input.role);
  if (!input.authTimes) return input.role === 'admin' ? 'expired' : null;
  if (input.now - input.authTimes.firstAt > limits.maxAgeMs) return 'expired';
  if (limits.idleMs !== null) {
    const lastSeen = Math.max(input.lastActivityAt ?? 0, input.authTimes.lastAt);
    if (input.now - lastSeen > limits.idleMs) return 'idle';
  }
  return null;
}

/** The text Postgres' lock hook answers with (auth_attempt_decision). */
const LOCKED_MESSAGE = /account temporarily locked/iu;

/**
 * Whether an error of Supabase Auth is the temporary lock of the account:
 * the password hook answers `invalid_credentials` with its own message, the
 * second-factor hook `mfa_verification_rejected`.
 */
export function isAccountLockedError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  return error.code === 'mfa_verification_rejected' || LOCKED_MESSAGE.test(error.message ?? '');
}

/** The 6 digits of an authenticator app (spaces are dropped). */
export const totpCodeField = z
  .string({ error: secondFactorCopy.errors.codeFormat })
  .transform((value) => value.replace(/\s+/gu, ''))
  .pipe(z.string().regex(/^\d{6}$/u, { error: secondFactorCopy.errors.codeFormat }));
