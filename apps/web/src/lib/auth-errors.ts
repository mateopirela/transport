import {
  accessSecurityCopy,
  authErrors,
  isAccountLockedError,
  LOGIN_LOCKOUT,
} from '@transport/shared';

import { refillValues, type FormState } from './forms';

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

/** Fixed English messages of the invitation and registration RPCs (G1b, G2). */
const MESSAGES: [RegExp, AuthErrorKey][] = [
  [/invalid or expired invitation/u, 'invitationInvalid'],
  [/only coordinator accounts can accept/u, 'invitationWrongAccount'],
  [/already belongs to a company/u, 'alreadyInCompany'],
  [/email not confirmed/u, 'emailNotConfirmed'],
  [/phone is required/u, 'phoneRequired'],
];

/** Copy key for an auth or RPC error. Unknown errors get the generic message. */
export function authErrorKey(
  error: { code?: string | null; message?: string | null } | null | undefined,
): AuthErrorKey {
  const code = error?.code;
  const key = code && Object.hasOwn(KEYS, code) ? KEYS[code] : undefined;
  if (key) return key;
  const message = error?.message ?? '';
  return MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? 'generic';
}

/** Spanish message for an auth or RPC error. */
export function authErrorMessage(
  error: { code?: string | null; message?: string | null } | null | undefined,
): string {
  // The lock of the account after failed attempts (R5, D46) comes as
  // `invalid_credentials` with the hook's own message.
  if (isAccountLockedError(error)) {
    return accessSecurityCopy.accountLocked(LOGIN_LOCKOUT.lockMinutes);
  }
  return authErrors[authErrorKey(error)];
}

/**
 * The form field an auth error is about (D42: the error goes on the field
 * that failed). The others stay on the whole form.
 */
const ERROR_FIELDS: Partial<Record<AuthErrorKey, string>> = {
  emailTaken: 'email',
  phoneTaken: 'phone',
  weakPassword: 'password',
  samePassword: 'password',
};

/** The field an auth error belongs to, or null when it is about the whole form. */
export function authErrorField(
  error: { code?: string | null; message?: string | null } | null | undefined,
): string | null {
  if (isAccountLockedError(error)) return null;
  return ERROR_FIELDS[authErrorKey(error)] ?? null;
}

/**
 * The form state of a failed sign-up or sign-in: the message on its field
 * when it has one, on the whole form otherwise, and the typed values back
 * (never the passwords).
 */
export function authFailureState(
  error: { code?: string | null; message?: string | null } | null | undefined,
  entries: Record<string, string>,
): FormState {
  const message = authErrorMessage(error);
  const field = authErrorField(error);
  const values = refillValues(entries);
  return field ? { fieldErrors: { [field]: message }, values } : { error: message, values };
}

/** Whether an untrusted value (e.g. a query parameter) names an auth error. */
export function isAuthErrorKey(value: unknown): value is AuthErrorKey {
  return typeof value === 'string' && Object.hasOwn(authErrors, value);
}
