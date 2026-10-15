import { authErrors } from '@transport/shared';

/** Error codes of Supabase Auth (`AuthError.code`) and Postgres (`PostgrestError.code`). */
const MESSAGES: Record<string, string> = {
  invalid_credentials: authErrors.invalidCredentials,
  email_not_confirmed: authErrors.emailNotConfirmed,
  user_already_exists: authErrors.emailTaken,
  email_exists: authErrors.emailTaken,
  weak_password: authErrors.weakPassword,
  same_password: authErrors.samePassword,
  over_email_send_rate_limit: authErrors.rateLimited,
  over_request_rate_limit: authErrors.rateLimited,
  otp_expired: authErrors.linkInvalid,
  flow_state_expired: authErrors.linkInvalid,
  flow_state_not_found: authErrors.linkInvalid,
  bad_code_verifier: authErrors.linkInvalid,
  // unique_violation: the only unique key create_company can hit is the RFC.
  '23505': authErrors.rfcTaken,
};

/** Spanish message for an auth or RPC error. Unknown errors get a generic message. */
export function authErrorMessage(error: { code?: string | null } | null | undefined): string {
  const code = error?.code;
  return (code && MESSAGES[code]) ?? authErrors.generic;
}
