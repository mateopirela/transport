import { authErrors } from '@transport/shared';

export type AuthErrorKey = keyof typeof authErrors;

/** Error codes of Supabase Auth (`AuthError.code`) and Postgres (`PostgrestError.code`). */
const KEYS: Record<string, AuthErrorKey> = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  user_already_exists: 'emailTaken',
  email_exists: 'emailTaken',
  weak_password: 'weakPassword',
  same_password: 'samePassword',
  over_email_send_rate_limit: 'rateLimited',
  over_request_rate_limit: 'rateLimited',
  otp_expired: 'linkInvalid',
  flow_state_expired: 'linkInvalid',
  flow_state_not_found: 'linkInvalid',
  bad_code_verifier: 'linkInvalid',
  // unique_violation: the only unique key create_company can hit is the RFC.
  '23505': 'rfcTaken',
};

/** Copy key for an auth or RPC error. Unknown errors get the generic message. */
export function authErrorKey(error: { code?: string | null } | null | undefined): AuthErrorKey {
  const code = error?.code;
  const key = code && Object.hasOwn(KEYS, code) ? KEYS[code] : undefined;
  return key ?? 'generic';
}

/** Spanish message for an auth or RPC error. */
export function authErrorMessage(error: { code?: string | null } | null | undefined): string {
  return authErrors[authErrorKey(error)];
}

/** Whether an untrusted value (e.g. a query parameter) names an auth error. */
export function isAuthErrorKey(value: unknown): value is AuthErrorKey {
  return typeof value === 'string' && Object.hasOwn(authErrors, value);
}
