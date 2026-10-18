// Edge Function `shared-document-url` (G6, D21): a 60-second signed URL of a
// carrier's document shared with the shipper of a trip.
//
//   POST { shareId } with the user's JWT → { signedPath, expiresIn }
//
// 1. The user comes from the JWT (Auth `/user`), never from the body.
// 2. Rate limit: 30 calls a minute per user (consume_rate_limit with the
//    user's JWT).
// 3. authorize_shared_document_view_service (service role only) checks that
//    the share is in force and that the user is of the trip's shipper, logs
//    the view and returns the object. The shipper never gets Storage
//    permissions on `documents`.
// 4. Storage signs that object for 60 seconds with the service role.
//
// The answer is a path (`/storage/v1/object/sign/...?token=...`): the caller
// joins it to the Supabase URL it already knows, because inside the Edge
// runtime SUPABASE_URL may be an internal address. Paths, tokens and user ids
// never reach the logs.
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface Dependencies {
  env: (name: string) => string | undefined;
  fetch: FetchLike;
  log?: Logger;
}

export const SIGNED_URL_SECONDS = 60;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Same shape the documents bucket policies accept (B03). */
const DOCUMENT_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(company|vehicle|operator)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9A-Za-z._-]{1,120}$/u;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...headers,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/** PostgREST and Storage headers for a key: new secret keys go only in `apikey`. */
function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function parseShareId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { shareId } = body as Record<string, unknown>;
  return typeof shareId === 'string' && UUID.test(shareId) ? shareId.toLowerCase() : null;
}

/** The id of the JWT's user, or null when Auth does not accept the token. */
async function userIdOf(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  fetch: FetchLike,
): Promise<string | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return typeof user?.id === 'string' && UUID.test(user.id) ? user.id : null;
}

/** One hit of the caller's limit; a Response when refused. */
async function consumeRateLimit(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  fetch: FetchLike,
  log: Logger,
): Promise<Response | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_rate_limit`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_bucket: 'shared_document_url' }),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { code?: string };
    if (response.status === 401 || error.code === '42501')
      return json({ error: 'unauthorized' }, 401);
    log.error('consume_rate_limit failed', { status: response.status, code: error.code });
    return json({ error: 'upstream_error' }, 502);
  }
  const retryAfter: unknown = await response.json();
  if (typeof retryAfter !== 'number' || !Number.isInteger(retryAfter) || retryAfter < 0) {
    throw new Error('malformed rate limit answer');
  }
  return retryAfter > 0
    ? json({ error: 'rate_limited' }, 429, { 'Retry-After': String(retryAfter) })
    : null;
}

export async function handleSharedDocumentUrl(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  const log = deps.log ?? createLogger({ service: 'shared-document-url' });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = deps.env('SUPABASE_URL');
  const anonKey = deps.env('SUPABASE_ANON_KEY');
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'not_configured' }, 500);

  let shareId: string | null = null;
  try {
    shareId = parseShareId(await request.json());
  } catch {
    // Invalid JSON: same answer as an invalid body.
  }
  if (!shareId) return json({ error: 'invalid_request' }, 400);

  try {
    const userId = await userIdOf(supabaseUrl, anonKey, authorization, deps.fetch);
    if (!userId) return json({ error: 'unauthorized' }, 401);

    const refusal = await consumeRateLimit(supabaseUrl, anonKey, authorization, deps.fetch, log);
    if (refusal) return refusal;

    const authorized = await deps.fetch(
      `${supabaseUrl}/rest/v1/rpc/authorize_shared_document_view_service`,
      {
        method: 'POST',
        headers: serviceHeaders(serviceKey),
        body: JSON.stringify({ p_share_id: shareId, p_user_id: userId }),
      },
    );
    if (!authorized.ok) {
      const error = (await authorized.json().catch(() => ({}))) as { code?: string };
      // Unknown, revoked or foreign share: the same answer, nothing revealed.
      if (error.code === '42501') return json({ error: 'not_found' }, 404);
      log.error('authorize_shared_document_view_service failed', {
        status: authorized.status,
        code: error.code,
      });
      return json({ error: 'upstream_error' }, 502);
    }
    const path: unknown = await authorized.json();
    if (typeof path !== 'string' || !DOCUMENT_PATH.test(path)) {
      log.error('authorize_shared_document_view_service returned an unexpected path');
      return json({ error: 'upstream_error' }, 502);
    }

    const objectPath = path.split('/').map(encodeURIComponent).join('/');
    const signed = await deps.fetch(
      `${supabaseUrl}/storage/v1/object/sign/documents/${objectPath}`,
      {
        method: 'POST',
        headers: serviceHeaders(serviceKey),
        body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
      },
    );
    if (!signed.ok) {
      log.error('storage sign failed', { status: signed.status });
      return json(
        { error: signed.status === 404 || signed.status === 400 ? 'not_found' : 'upstream_error' },
        signed.status === 404 || signed.status === 400 ? 404 : 502,
      );
    }
    const { signedURL } = (await signed.json()) as { signedURL?: unknown };
    if (typeof signedURL !== 'string' || !signedURL.startsWith('/object/sign/documents/')) {
      log.error('storage sign returned an unexpected URL');
      return json({ error: 'upstream_error' }, 502);
    }
    return json({ signedPath: `/storage/v1${signedURL}`, expiresIn: SIGNED_URL_SECONDS });
  } catch (error) {
    log.error('shared-document-url failed', { error });
    return json({ error: 'upstream_error' }, 502);
  }
}
