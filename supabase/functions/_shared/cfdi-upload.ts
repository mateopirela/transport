// Upload of a freight CFDI (I5, D37), shared by `validate-carrier-cfdi` (the
// carrier's invoice to Fulmis) and `issue-client-cfdi` (Fulmis' invoice to
// the client, uploaded by the admin while the provider is `manual`).
//
//   POST multipart/form-data { tripId, xml, pdf? } with the user's JWT
//     → 200 { invoiceId, validation }
//     → 422 { error: 'invalid_cfdi', failures: [...] } (every failed rule)
//
// 1. The body is read with a hard limit (XML 1 MiB, PDF 5 MiB), never more.
// 2. The user comes from the JWT (Auth `/user`), never from the body, and is
//    rate limited (consume_rate_limit with the user's JWT). An upload only
//    admins make (Fulmis' CFDI to the client) also asks is_admin() with the
//    user's JWT, so the admin's session needs the second factor (R5, D46).
// 3. The XML is parsed without DTDs (packages/shared/src/freight/cfdi.ts) and
//    the PDF must start as a PDF.
// 4. check_freight_invoice_service (service role only) checks the uploader
//    and the rules that depend on the trip: issuer, receiver, total, MXN,
//    unique UUID, one invoice per side, not cancelled, client terms. It runs
//    also when the XML is a readable CFDI that breaks rules of form (or the PDF
//    is wrong), so every failed rule is told at once; an unreadable XML gets
//    only the parser's reason (and the PDF's).
// 5. Only then the files go to the private `invoices` bucket, under a random
//    name, and record_freight_invoice_service registers the invoice after
//    checking everything again under the ledger's lock. If it refuses, the
//    files are removed.
//
// Paths, tokens, RFCs and user ids never reach the logs.
import {
  CFDI_PDF_MAX_BYTES,
  CFDI_XML_MAX_BYTES,
  looksLikePdf,
  parseCfdi,
  type CfdiFields,
  type CfdiIssue,
} from '../../../packages/shared/src/freight/cfdi.ts';
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type InvoiceDirection = 'fulmis_to_client' | 'carrier_to_fulmis';

export interface UploadDependencies {
  env: (name: string) => string | undefined;
  fetch: FetchLike;
  log?: Logger;
  /** Random object names (tests pass a fixed one). */
  randomUUID?: () => string;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
};

/** Largest body accepted: both files plus the multipart overhead. */
export const MAX_BODY_BYTES = CFDI_XML_MAX_BYTES + CFDI_PDF_MAX_BYTES + 64 * 1024;

export const RATE_LIMIT_BUCKET = 'freight_invoice_upload';

/** The request-level failures; the rest come from the parser and the database. */
type RequestFailure = 'xml_missing' | 'pdf_missing' | 'pdf_invalid' | 'pdf_too_large';
export type UploadFailure = CfdiIssue | RequestFailure | string;

/**
 * The database's rule on a field the parser found invalid (and passed as
 * null): already told by the parser's reason, so it is not repeated.
 */
const REPEATED: readonly [keyof CfdiFields, string][] = [
  ['uuid', 'uuid_taken'],
  ['issuerRfc', 'issuer_mismatch'],
  ['receiverRfc', 'receiver_mismatch'],
  ['totalCents', 'total_mismatch'],
  ['currency', 'currency'],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const FAILURE = /^[a-z_]{1,40}$/u;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
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

function invalid(failures: readonly UploadFailure[], status = 422): Response {
  return json({ error: 'invalid_cfdi', failures }, status);
}

/** PostgREST and Storage headers for a key: new secret keys go only in `apikey`. */
export function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * The body, read up to `max` bytes. Null when it is larger: the read stops
 * there, so a huge or endless body is never buffered.
 */
export async function readLimitedBody(
  request: Request,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(new ArrayBuffer(size));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
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

/**
 * Whether the JWT is an admin's session with the second factor: is_admin()
 * with the user's JWT (aal2, R5). Null when PostgREST fails.
 */
async function isAdminSession(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  fetch: FetchLike,
): Promise<boolean | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) return response.status === 401 ? false : null;
  return (await response.json().catch(() => null)) === true;
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
    body: JSON.stringify({ p_bucket: RATE_LIMIT_BUCKET }),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { code?: string };
    if (response.status === 401 || error.code === '42501') {
      return json({ error: 'unauthorized' }, 401);
    }
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

interface PostgrestError {
  code?: string;
  details?: string | null;
}

/** The failure codes in a PostgREST error's detail (`a,b,c`), if they look like codes. */
function failuresOf(error: PostgrestError): string[] {
  return (error.details ?? '').split(',').filter((code) => FAILURE.test(code));
}

export interface UploadOptions {
  direction: InvoiceDirection;
  /** Who issued it: `manual` for an uploaded CFDI. */
  provider: string;
  /** Whether the PDF is required (Fulmis' invoice: the client downloads it). */
  pdfRequired: boolean;
  /** Only an admin with the second factor uploads it (Fulmis' invoice, R5). */
  adminOnly?: boolean;
}

/** Takes a CFDI upload of the trip in `options.direction`. */
export async function handleCfdiUpload(
  request: Request,
  deps: UploadDependencies,
  options: UploadOptions,
): Promise<Response> {
  const log = deps.log ?? createLogger({ service: 'cfdi-upload' });
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = deps.env('SUPABASE_URL');
  const anonKey = deps.env('SUPABASE_ANON_KEY');
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'not_configured' }, 500);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return json({ error: 'invalid_request' }, 400);
  }
  // The session and the limit first: every request that reaches the body,
  // valid or not, spends one of the caller's uploads.
  try {
    const userId = await userIdOf(supabaseUrl, anonKey, authorization, deps.fetch);
    if (!userId) return json({ error: 'unauthorized' }, 401);
    if (options.adminOnly) {
      const admin = await isAdminSession(supabaseUrl, anonKey, authorization, deps.fetch);
      if (admin === null) {
        log.error('is_admin failed');
        return json({ error: 'upstream_error' }, 502);
      }
      // The same answer as a trip the caller cannot reach: nothing revealed.
      if (!admin) return json({ error: 'not_found' }, 404);
    }
    const refusal = await consumeRateLimit(supabaseUrl, anonKey, authorization, deps.fetch, log);
    if (refusal) return refusal;

    const body = await readLimitedBody(request, MAX_BODY_BYTES);
    if (!body) return invalid(['too_large'], 413);
    let form: FormData;
    try {
      form = await new Response(body, { headers: { 'Content-Type': contentType } }).formData();
    } catch {
      return json({ error: 'invalid_request' }, 400);
    }
    const tripId = form.get('tripId');
    if (typeof tripId !== 'string' || !UUID.test(tripId)) {
      return json({ error: 'invalid_request' }, 400);
    }
    const trip = tripId.toLowerCase();
    const xmlFile = form.get('xml');
    const pdfEntry = form.get('pdf');
    const pdfFile = pdfEntry instanceof File && pdfEntry.size > 0 ? pdfEntry : null;

    const failures: UploadFailure[] = [];
    if (!(xmlFile instanceof File) || xmlFile.size === 0) failures.push('xml_missing');
    else if (xmlFile.size > CFDI_XML_MAX_BYTES) failures.push('too_large');
    let pdf: Uint8Array<ArrayBuffer> | null = null;
    if (!pdfFile) {
      if (options.pdfRequired) failures.push('pdf_missing');
    } else if (pdfFile.size > CFDI_PDF_MAX_BYTES) {
      failures.push('pdf_too_large');
    } else {
      pdf = new Uint8Array(await pdfFile.arrayBuffer());
      if (!looksLikePdf(pdf)) failures.push('pdf_invalid');
    }

    if (!(xmlFile instanceof File) || failures.includes('too_large')) return invalid(failures);
    const xml = new Uint8Array(await xmlFile.arrayBuffer());
    let parsed: ReturnType<typeof parseCfdi>;
    try {
      parsed = parseCfdi(new TextDecoder('utf-8', { fatal: true }).decode(xml));
    } catch {
      parsed = { ok: false, issues: ['malformed'] };
    }
    // An XML that is not a readable CFDI: its reason and the PDF's.
    if (!parsed.ok && !parsed.fields) return invalid([...parsed.issues, ...failures]);
    const read: CfdiFields = parsed.ok ? parsed.cfdi : (parsed.fields as CfdiFields);

    const rpc = (name: string, args: Record<string, unknown>) =>
      deps.fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { ...serviceHeaders(serviceKey), 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    const fields = {
      p_user_id: userId,
      p_trip_id: trip,
      p_direction: options.direction,
      p_cfdi_uuid: read.uuid,
      p_issuer_rfc: read.issuerRfc,
      p_receiver_rfc: read.receiverRfc,
      p_total_cents: read.totalCents,
      p_currency: read.currency,
    };

    const checked = await rpc('check_freight_invoice_service', fields);
    if (!checked.ok) {
      const error = (await checked.json().catch(() => ({}))) as PostgrestError;
      // Unknown trip or no access to it: the same answer, nothing revealed.
      if (error.code === '42501') return json({ error: 'not_found' }, 404);
      log.error('check_freight_invoice_service failed', {
        status: checked.status,
        code: error.code,
      });
      return json({ error: 'upstream_error' }, 502);
    }
    const check = (await checked.json()) as { failures?: unknown };
    const ruleFailures = Array.isArray(check.failures)
      ? check.failures.filter((code): code is string => typeof code === 'string')
      : null;
    if (!ruleFailures) {
      log.error('check_freight_invoice_service returned an unexpected answer');
      return json({ error: 'upstream_error' }, 502);
    }
    // Every reason at once, each told once: the XML's, the trip's and the PDF's.
    const repeated = new Set(
      REPEATED.filter(([field]) => read[field] === null).map(([, failure]) => failure),
    );
    const all = new Set<UploadFailure>([
      ...(parsed.ok ? [] : parsed.issues),
      ...ruleFailures.filter((failure) => !repeated.has(failure)),
      ...failures,
    ]);
    if (!parsed.ok || all.size > 0) return invalid([...all]);
    const cfdi = parsed.cfdi;

    // The files, under names nobody can guess or reuse.
    const name = deps.randomUUID ?? (() => crypto.randomUUID());
    const xmlPath = `${trip}/${options.direction}/${name()}.xml`;
    const pdfPath = pdf ? `${trip}/${options.direction}/${name()}.pdf` : null;
    const stored: string[] = [];
    const removeStored = async () => {
      if (stored.length === 0) return;
      const removed = await deps
        .fetch(`${supabaseUrl}/storage/v1/object/invoices`, {
          method: 'DELETE',
          headers: { ...serviceHeaders(serviceKey), 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: stored }),
        })
        .catch(() => null);
      if (!removed?.ok)
        log.warn('could not remove the stored invoice files', { count: stored.length });
    };
    // A failed or thrown upload is cleaned up with the files stored before it.
    // Storage may have kept the object of a request that threw: it is removed
    // too (by its unique name), since no invoice points to it yet.
    const store = async (path: string, bytes: Uint8Array<ArrayBuffer>, type: string) => {
      stored.push(path);
      try {
        const response = await deps.fetch(`${supabaseUrl}/storage/v1/object/invoices/${path}`, {
          method: 'POST',
          headers: { ...serviceHeaders(serviceKey), 'Content-Type': type, 'x-upsert': 'false' },
          body: bytes,
        });
        if (response.ok) return true;
        log.error('storage upload failed', { status: response.status });
      } catch (error) {
        log.error('storage upload failed', { error });
      }
      return false;
    };
    if (
      !(await store(xmlPath, xml, 'application/xml')) ||
      (pdf && pdfPath && !(await store(pdfPath, pdf, 'application/pdf')))
    ) {
      await removeStored();
      return json({ error: 'upstream_error' }, 502);
    }

    // If the call itself throws, the invoice may have been committed: its files
    // stay (an orphan file is harmless and unreadable; a lost one is not).
    const recorded = await rpc('record_freight_invoice_service', {
      ...fields,
      p_issued_at: cfdi.issuedAt,
      p_xml_path: xmlPath,
      p_pdf_path: pdfPath,
      p_provider: options.provider,
    });
    if (!recorded.ok) {
      const error = (await recorded.json().catch(() => ({}))) as PostgrestError;
      await removeStored();
      if (error.code === '42501') return json({ error: 'not_found' }, 404);
      if (error.code === '22023' || error.code === '23505') {
        const codes = failuresOf(error);
        return invalid(codes.length > 0 ? codes : ['uuid_taken']);
      }
      log.error('record_freight_invoice_service failed', {
        status: recorded.status,
        code: error.code,
      });
      return json({ error: 'upstream_error' }, 502);
    }
    const result = (await recorded.json().catch(() => null)) as {
      invoiceId?: unknown;
      validation?: unknown;
    } | null;
    const invoiceId = result?.invoiceId;
    if (typeof invoiceId !== 'string' || !UUID.test(invoiceId)) {
      log.error('record_freight_invoice_service returned an unexpected answer');
      return json({ error: 'upstream_error' }, 502);
    }
    return json({
      invoiceId,
      validation: result?.validation === 'validated' ? 'validated' : 'unvalidated',
    });
  } catch (error) {
    log.error('cfdi upload failed', { error });
    return json({ error: 'upstream_error' }, 502);
  }
}
