// Redaction shared by the structured logs and the Sentry events (B25).
// Credentials and personal data (LFPDPPP) never leave the process: keys that
// look like a secret, a contact or a position are replaced, at any depth.

export const REDACTED = '[redacted]';

/** Words of a key that hold credentials (only text and objects are hidden). */
const SECRET_WORDS = new Set([
  'apikey',
  'authorization',
  'cookie',
  'dsn',
  'jwt',
  'key',
  'passwd',
  'password',
  'secret',
  'token',
  'tokens',
]);
/**
 * Words of a key that hold personal data (LFPDPPP): always hidden. Emails
 * inside any text are also scrubbed by redactText.
 */
const PERSONAL_WORDS = new Set([
  'address',
  'coords',
  'email',
  'ip',
  'lat',
  'latitude',
  'lng',
  'location',
  'locations',
  'lon',
  'longitude',
  'phone',
  'rfc',
]);

const MAX_DEPTH = 6;
const MAX_STRING = 500;

/** `originLat`, `origin_lat` and `x-origin-lat` all give [origin, lat]. */
function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

export function isSensitiveKey(key: string): boolean {
  return keyWords(key).some((w) => SECRET_WORDS.has(w) || PERSONAL_WORDS.has(w));
}

/** Hidden value for this key, or undefined to keep (and recurse into) it. */
function hide(key: string, value: unknown): typeof REDACTED | undefined {
  const words = keyWords(key);
  if (words.some((w) => PERSONAL_WORDS.has(w))) return REDACTED;
  // A count such as `invalidTokens: 3` is not a credential.
  if (words.some((w) => SECRET_WORDS.has(w))) {
    return typeof value === 'number' || typeof value === 'boolean' ? undefined : REDACTED;
  }
  return undefined;
}

/** Bearer tokens, JWTs and emails inside free text (e.g. an error message). */
export function redactText(text: string): string {
  return text
    .replace(/bearer\s+[\w.~+/=-]+/giu, `Bearer ${REDACTED}`)
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/gu, REDACTED)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/gu, REDACTED)
    .slice(0, MAX_STRING);
}

/** Deep copy without sensitive keys; strings are scanned and truncated. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = hide(key, item) ?? redact(item, depth + 1);
  }
  return out;
}

export interface SerializedError {
  name: string;
  message?: string;
  code?: string;
  status?: number;
}

/** Name, code and a redacted message: never the raw object (it may hold a request). */
export function serializeError(error: unknown): SerializedError {
  if (typeof error !== 'object' || error === null) {
    return { name: typeof error, message: redactText(String(error)) };
  }
  const e = error as Record<string, unknown>;
  const out: SerializedError = { name: typeof e.name === 'string' ? e.name : 'Error' };
  if (typeof e.message === 'string' && e.message) out.message = redactText(e.message);
  if (typeof e.code === 'string') out.code = e.code;
  if (typeof e.status === 'number') out.status = e.status;
  return out;
}
