// Edge Function `redeem-invitation` (G2, D15-E1): redeems an operator
// invitation link. The caller has no session (verify_jwt = false); the token
// is the credential and Postgres validates it (invitation_preview and
// redeem_operator_invitation_service, G1b).
//
//   POST { token, fullName, phone, password, email? }   operator link
//   POST { token, password }                            operator_access_reset link
//
// 1. Rate limits (consume_service_rate_limit): per client IP (hashed) and
//    per token (hashed), so one address cannot mint accounts in bulk and a
//    stolen link cannot be brute forced against the password rules.
// 2. invitation_preview tells the kind of the link (same error for unknown,
//    used, revoked and expired tokens: the answer is always 404).
// 3. operator: the Auth account is created with the synthetic email of the
//    phone (phoneAuthEmail: `52XXXXXXXXXX@tel.transport.invalid`, a domain
//    that never receives mail), confirmed. handle_new_user accepts an
//    operator only with a provisioning ticket that this function issues
//    first (service role) and whose nonce goes in user_metadata; the account
//    is also marked with app_metadata.provisioned_by = 'redeem-invitation'.
//    Then redeem_operator_invitation_service links it to the company; if that
//    fails the account is deleted again (compensation), so no orphan operator
//    account survives.
// 4. operator_access_reset: redeem_operator_invitation_service marks the link
//    used and returns the operator's profile id; the password of that account
//    is replaced and its sessions ended (revoke_user_sessions_service). If
//    the password update fails the link stays used: the answer asks for a
//    new one, so a link never allows two redemptions.
// 5. Logs and Sentry never see the phone, the password, the email or the
//    token: only the kind, the outcome and opaque ids.
import { phoneAuthEmail } from '../../../packages/shared/src/phone.ts';
import {
  accessResetRedeemSchema,
  invitationTokenField,
  operatorRedeemSchema,
  type RedeemableKind,
} from '../../../packages/shared/src/schemas/redeem.ts';
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface Dependencies {
  env: (name: string) => string | undefined;
  fetch: FetchLike;
  /** Structured logger of the request (B25); a plain one when not given. */
  log?: Logger;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
};

/** Error codes of the JSON answers; the apps map them to Spanish copy. */
export type RedeemError =
  | 'method_not_allowed'
  | 'not_configured'
  | 'invalid_body'
  | 'rate_limited'
  | 'invalid_invitation'
  | 'phone_taken'
  | 'password_not_saved'
  | 'upstream_error';

const REQUEST_TIMEOUT_MS = 10_000;
const defaultLog = createLogger({ service: 'redeem-invitation' });

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...headers, 'Content-Type': 'application/json' },
  });
}

const fail = (error: RedeemError, status: number, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, status);

/** Headers of a service-role call: new secret keys go only in `apikey`. */
function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** 32 random bytes in hex: the nonce of a provisioning ticket. */
function randomNonce(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The client address as the gateway reports it; only ever used hashed. The
 * edge's own header comes first: the first entry of X-Forwarded-For is
 * whatever the client sent, so it is only the fallback (the per-token limit
 * holds either way).
 */
function clientAddress(request: Request): string {
  const edge = request.headers.get('cf-connecting-ip')?.trim();
  if (edge) return edge;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return forwarded || 'unknown';
}

/** A PostgREST or GoTrue error body, when there is one. */
interface ApiError {
  status: number;
  code: string | null;
  message: string;
}

class UpstreamError extends Error {
  constructor(
    readonly api: ApiError,
    readonly call: string,
  ) {
    super(`${call} failed with ${api.status}${api.code ? ` (${api.code})` : ''}`);
    this.name = 'UpstreamError';
  }
}

async function readError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const code =
    typeof body.error_code === 'string'
      ? body.error_code
      : typeof body.code === 'string'
        ? body.code
        : null;
  const message =
    typeof body.message === 'string' ? body.message : typeof body.msg === 'string' ? body.msg : '';
  return { status: response.status, code, message };
}

interface Backend {
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  createUser(input: {
    email: string;
    password: string;
    userMetadata: Record<string, unknown>;
  }): Promise<string>;
  updatePassword(userId: string, password: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

function createBackend(supabaseUrl: string, serviceKey: string, fetch: FetchLike): Backend {
  const call = async (path: string, init: RequestInit, name: string): Promise<unknown> => {
    const response = await fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: { ...serviceHeaders(serviceKey), ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new UpstreamError(await readError(response), name);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  };
  return {
    rpc: (fn, args) =>
      call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }, fn),
    async createUser({ email, password, userMetadata }) {
      const user = (await call(
        '/auth/v1/admin/users',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: userMetadata,
            // Only the service role writes app_metadata: handle_new_user
            // accepts an operator sign-up only with this marker.
            app_metadata: { provisioned_by: 'redeem-invitation' },
          }),
        },
        'createUser',
      )) as { id?: unknown } | null;
      if (!user || typeof user.id !== 'string') throw new Error('createUser returned no id');
      return user.id;
    },
    async updatePassword(userId, password) {
      await call(
        `/auth/v1/admin/users/${userId}`,
        { method: 'PUT', body: JSON.stringify({ password }) },
        'updatePassword',
      );
    },
    async deleteUser(userId) {
      await call(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }, 'deleteUser');
    },
  };
}

/** Field messages of a failed zod parse (Spanish copy), keyed by field. */
function fieldIssues(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[issue.path.join('.') || 'form'] ??= issue.message;
  return fields;
}

/** True for the PostgREST error of a link that is unknown, used, revoked or expired. */
const isInvalidInvitation = (error: unknown) =>
  error instanceof UpstreamError &&
  error.api.code === '22023' &&
  error.api.message.includes('invalid or expired invitation');

export async function handleRedeem(request: Request, deps: Dependencies): Promise<Response> {
  const log = deps.log ?? defaultLog;
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return fail('method_not_allowed', 405);

  const supabaseUrl = deps.env('SUPABASE_URL');
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  // Fail closed: without the service role nothing can be redeemed.
  if (!supabaseUrl || !serviceKey) return fail('not_configured', 503);

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return fail('invalid_body', 400);
  const token = invitationTokenField.safeParse((body as { token?: unknown }).token);
  if (!token.success)
    return fail('invalid_body', 400, { fields: { token: token.error.issues[0]?.message } });

  const backend = createBackend(supabaseUrl, serviceKey, deps.fetch);

  // 1. Rate limits, per address and per token. Fail closed without the counter.
  try {
    for (const [bucket, subject] of [
      ['redeem-invitation-ip', await sha256Hex(clientAddress(request))],
      ['redeem-invitation-token', await sha256Hex(token.data)],
    ] as const) {
      const retryAfter = await backend.rpc('consume_service_rate_limit', {
        p_bucket: bucket,
        p_subject: subject,
      });
      if (!Number.isInteger(retryAfter) || (retryAfter as number) < 0) {
        throw new Error('consume_service_rate_limit returned a malformed answer');
      }
      if ((retryAfter as number) > 0) {
        log.warn('rate limited', { bucket });
        return fail('rate_limited', 429, { retryAfter });
      }
    }
  } catch (error) {
    log.error('rate limit failed', { error });
    return fail('upstream_error', 502);
  }

  // 2. What the link is for.
  let kind: RedeemableKind;
  try {
    const rows = (await backend.rpc('invitation_preview', { p_token: token.data })) as unknown;
    const preview = Array.isArray(rows) ? (rows[0] as { kind?: unknown } | undefined) : null;
    if (preview?.kind !== 'operator' && preview?.kind !== 'operator_access_reset') {
      // A coordinator link is accepted by the signed-in coordinator, never here.
      return fail('invalid_invitation', 404);
    }
    kind = preview.kind;
  } catch (error) {
    if (isInvalidInvitation(error)) return fail('invalid_invitation', 404);
    log.error('invitation_preview failed', { error });
    return fail('upstream_error', 502);
  }

  if (kind === 'operator') return redeemOperator(body, backend, log);
  return redeemAccessReset(body, backend, log);
}

async function redeemOperator(body: unknown, backend: Backend, log: Logger): Promise<Response> {
  const parsed = operatorRedeemSchema.safeParse(body);
  if (!parsed.success) return fail('invalid_body', 400, { fields: fieldIssues(parsed.error) });
  const { token, fullName, phone, password, email } = parsed.data;
  const authEmail = phoneAuthEmail(phone);

  // 3. The account, then the link; the account is removed if the link fails.
  // GoTrue writes app_metadata after inserting the user, so handle_new_user
  // recognizes this account by a single-use ticket instead: issued here for
  // the synthetic email and bound to a random nonce sent in user_metadata.
  const nonce = randomNonce();
  try {
    await backend.rpc('issue_operator_provisioning_ticket_service', {
      p_email: authEmail,
      p_nonce: nonce,
    });
  } catch (error) {
    log.error('issue_operator_provisioning_ticket_service failed', { error });
    return fail('upstream_error', 502);
  }

  let userId: string;
  try {
    userId = await backend.createUser({
      email: authEmail,
      password,
      // Read by handle_new_user (B01): role, name and phone of the profile,
      // and the nonce of the provisioning ticket.
      userMetadata: {
        role: 'operator',
        full_name: fullName,
        phone,
        provisioning_nonce: nonce,
        ...(email ? { contact_email: email } : {}),
      },
    });
  } catch (error) {
    if (error instanceof UpstreamError && error.api.code === 'email_exists') {
      log.info('redeem refused', { kind: 'operator', reason: 'phone_taken' });
      return fail('phone_taken', 409);
    }
    log.error('createUser failed', { error });
    return fail('upstream_error', 502);
  }

  try {
    await backend.rpc('redeem_operator_invitation_service', {
      p_token: token,
      p_user_id: userId,
      p_full_name: fullName,
      p_phone: phone,
      p_email: email ?? null,
    });
  } catch (error) {
    // Compensation: the link did not take, so the account must not stay.
    try {
      await backend.deleteUser(userId);
    } catch (cleanupError) {
      log.error('compensation failed: orphan operator account', { userId, error: cleanupError });
    }
    if (isInvalidInvitation(error)) {
      log.info('redeem refused', { kind: 'operator', reason: 'invalid_invitation' });
      return fail('invalid_invitation', 404);
    }
    log.error('redeem_operator_invitation_service failed', { error });
    return fail('upstream_error', 502);
  }

  log.info('redeemed', { kind: 'operator', userId });
  return json({ kind: 'operator', email: authEmail });
}

async function redeemAccessReset(body: unknown, backend: Backend, log: Logger): Promise<Response> {
  const parsed = accessResetRedeemSchema.safeParse(body);
  if (!parsed.success) return fail('invalid_body', 400, { fields: fieldIssues(parsed.error) });
  const { token, password } = parsed.data;

  // 4. The link first (single use), then the password of the account it names.
  let profileId: string;
  try {
    const rows = (await backend.rpc('redeem_operator_invitation_service', {
      p_token: token,
      p_user_id: null,
    })) as unknown;
    const row = Array.isArray(rows) ? (rows[0] as { profile_id?: unknown } | undefined) : null;
    if (typeof row?.profile_id !== 'string') throw new Error('redeem returned no profile id');
    profileId = row.profile_id;
  } catch (error) {
    if (isInvalidInvitation(error)) {
      log.info('redeem refused', { kind: 'operator_access_reset', reason: 'invalid_invitation' });
      return fail('invalid_invitation', 404);
    }
    log.error('redeem_operator_invitation_service failed', { error });
    return fail('upstream_error', 502);
  }

  try {
    await backend.updatePassword(profileId, password);
  } catch (error) {
    // The link is already used: the operator needs a new one, never a retry
    // of this one.
    log.error('password update failed after redeeming the link', { profileId, error });
    return fail('password_not_saved', 500);
  }

  let sessionsRevoked = true;
  try {
    await backend.rpc('revoke_user_sessions_service', { p_user_id: profileId });
  } catch (error) {
    sessionsRevoked = false;
    log.error('revoke_user_sessions_service failed', { profileId, error });
  }

  log.info('redeemed', { kind: 'operator_access_reset', profileId, sessionsRevoked });
  return json({ kind: 'operator_access_reset', sessionsRevoked });
}
