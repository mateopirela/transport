import {
  accessSecurityCopy,
  authErrors,
  isAccountLockedError,
  LOGIN_LOCKOUT,
  secondFactorCopy,
} from '@transport/shared';

const e = secondFactorCopy.errors;

/** Codes of Supabase Auth's MFA endpoints (AuthError.code). */
const MESSAGES: Record<string, string> = {
  mfa_verification_failed: e.invalidCode,
  mfa_challenge_expired: e.expired,
  mfa_factor_not_found: e.expired,
  mfa_verified_factor_exists: e.alreadyEnrolled,
  over_request_rate_limit: authErrors.rateLimited,
};

/** Spanish message for an error of the second factor (R5, D46). */
export function secondFactorErrorMessage(
  error: { code?: string | null; message?: string | null } | null | undefined,
): string {
  // Five wrong codes in a row lock it like five wrong passwords (the MFA hook).
  if (isAccountLockedError(error)) {
    return accessSecurityCopy.accountLocked(LOGIN_LOCKOUT.lockMinutes);
  }
  const code = error?.code;
  return (code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined) ?? authErrors.generic;
}
