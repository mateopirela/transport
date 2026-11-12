import { createHmac } from 'node:crypto';

// Codes of an authenticator app (TOTP, RFC 6238: HMAC-SHA1, 6 digits, 30 s),
// what Supabase Auth checks for the admins' second factor (R5, D46). Only for
// the local demo key of the seed and the keys the suite enrolls itself.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The bytes of a base32 key (RFC 4648; spaces, case and padding ignored). */
export function base32Decode(key: string): Buffer {
  const clean = key.replace(/[\s=]/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('invalid base32 key');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The code of `key` at `at` (ms), with `digits` digits (RFC 4226 truncation). */
export function totp(key: string, at = Date.now(), digits = 6, stepSeconds = 30): string {
  const counter = Math.floor(at / 1000 / stepSeconds);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(key)).update(message).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The test key of admin@demo.test (supabase/seed.sql, docs/demo-local.md). */
export const DEMO_ADMIN_TOTP_KEY = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/** The last code used per key: Supabase Auth may refuse a code used twice. */
const lastCodes = new Map<string, string>();

/**
 * The current code of `key`, waiting for the next one (they change every
 * 30 seconds) when the current one was already used by this suite.
 */
export async function unusedCode(key: string): Promise<string> {
  let code = totp(key);
  while (code === lastCodes.get(key)) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    code = totp(key);
  }
  lastCodes.set(key, code);
  return code;
}
