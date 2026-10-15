import type { MobileErrorKey } from '@transport/shared';

/** The fields we read from Supabase Auth and PostgREST errors. */
export interface ErrorLike {
  name?: string;
  code?: string;
  message?: string;
  status?: number;
}

const AUTH_CODES: Record<string, MobileErrorKey> = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  user_already_exists: 'userAlreadyExists',
  email_exists: 'userAlreadyExists',
  weak_password: 'weakPassword',
  over_request_rate_limit: 'rateLimited',
  over_email_send_rate_limit: 'rateLimited',
};

function asErrorLike(error: unknown): ErrorLike {
  if (typeof error !== 'object' || error === null) return {};
  const e = error as Record<string, unknown>;
  return {
    name: typeof e.name === 'string' ? e.name : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
    message: typeof e.message === 'string' ? e.message : undefined,
    status: typeof e.status === 'number' ? e.status : undefined,
  };
}

/**
 * Maps an error from Supabase (Auth, PostgREST or our RPCs) to a key of
 * `mobileErrorCopy`. Raw server messages are never shown to the user.
 */
export function toErrorKey(error: unknown): MobileErrorKey {
  const { name, code, message = '', status } = asErrorLike(error);
  const text = message.toLowerCase();

  if (code && code in AUTH_CODES) return AUTH_CODES[code] ?? 'unknown';
  if (status === 429) return 'rateLimited';
  if (
    name === 'AuthRetryableFetchError' ||
    text.includes('network request failed') ||
    text.includes('failed to fetch')
  ) {
    return 'network';
  }

  // Errors raised by the RPCs (see supabase/migrations).
  if (text.includes('invalid or expired invitation')) return 'invitationInvalid';
  if (text.includes('invitation was sent to another email')) return 'invitationOtherEmail';
  if (text.includes('only operator accounts can accept invitations'))
    return 'invitationWrongAccount';
  if (text.includes('already belongs to a company')) return 'alreadyInCompany';
  if (code === '23505' && text.includes('companies_rfc_key')) return 'rfcTaken';

  return 'unknown';
}

/** Invitation errors after which the stored code is useless and must be dropped. */
export function isFinalInvitationError(key: MobileErrorKey): boolean {
  return (
    key === 'invitationInvalid' ||
    key === 'invitationOtherEmail' ||
    key === 'invitationWrongAccount' ||
    key === 'alreadyInCompany'
  );
}
