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

/** JSON error codes of the Edge Function redeem-invitation (G2). */
const EDGE_FUNCTION_CODES: Record<string, MobileErrorKey> = {
  invalid_invitation: 'invitationInvalid',
  phone_taken: 'phoneTaken',
  rate_limited: 'rateLimited',
  password_not_saved: 'passwordNotSaved',
  invalid_body: 'unknown',
  not_configured: 'unknown',
  upstream_error: 'unknown',
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
 * Maps an error from Supabase (Auth, PostgREST, our RPCs or the Edge
 * Function) to a key of `mobileErrorCopy`. Raw server messages are never
 * shown to the user.
 */
export function toErrorKey(error: unknown): MobileErrorKey {
  const { name, code, message = '', status } = asErrorLike(error);
  const text = message.toLowerCase();

  if (name === 'EdgeFunctionError') {
    if (code && code in EDGE_FUNCTION_CODES) return EDGE_FUNCTION_CODES[code] ?? 'unknown';
    return status === null || status === undefined ? 'network' : 'unknown';
  }
  if (code && code in AUTH_CODES) return AUTH_CODES[code] ?? 'unknown';
  // HTTP 429, or the rate limit of our RPCs (SQLSTATE PT429, F12).
  if (status === 429 || code === 'PT429') return 'rateLimited';
  if (
    name === 'AuthRetryableFetchError' ||
    text.includes('network request failed') ||
    text.includes('failed to fetch')
  ) {
    return 'network';
  }

  // Errors raised by the RPCs (see supabase/migrations).
  if (text.includes('invalid or expired invitation')) return 'invitationInvalid';
  if (text.includes('only coordinator accounts can accept')) return 'invitationWrongAccount';
  if (text.includes('email not confirmed')) return 'emailNotConfirmedForInvitation';
  if (text.includes('already belongs to a company')) return 'alreadyInCompany';
  if (text.includes('invalid phone') || text.includes('phone is required')) return 'phoneInvalid';
  if (code === '23505' && text.includes('companies_rfc_key')) return 'rfcTaken';
  if (text.includes('fiscal') || text.includes('legalrepresentativename') || code === '23514') {
    return 'missingFiscalData';
  }

  return 'unknown';
}

/** Invitation errors after which the stored token is useless and must be dropped. */
export function isFinalInvitationError(key: MobileErrorKey): boolean {
  return (
    key === 'invitationInvalid' || key === 'invitationWrongAccount' || key === 'alreadyInCompany'
  );
}
