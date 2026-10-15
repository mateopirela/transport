// RFC (Registro Federal de Contribuyentes) validation.
// Persona moral: 3 letters + YYMMDD + 3-char homoclave = 12 characters.
// Persona física: 4 letters + YYMMDD + 3-char homoclave = 13 characters.

export type RfcKind = 'moral' | 'fisica';

export type RfcIssue = 'format' | 'date' | 'generic';

export type RfcResult = { ok: true; rfc: string; kind: RfcKind } | { ok: false; issue: RfcIssue };

const RFC_PATTERN = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2}[A\d])$/u;

/** SAT generic RFCs (público en general, extranjeros): not a real taxpayer. */
const GENERIC_RFCS = new Set(['XAXX010101000', 'XEXX010101000']);

/** Uppercases and strips spaces and dashes, as people often type them. */
export function normalizeRfc(input: string): string {
  return input.toUpperCase().replace(/[\s-]/gu, '');
}

function isValidRfcDate(yy: number, mm: number, dd: number): boolean {
  if (mm < 1 || mm > 12 || dd < 1) return false;
  // The century is ambiguous; YY divisible by 4 is a leap year in both
  // 19YY and 20YY (1900 is the only exception, and 2000 covers YY = 00).
  const febDays = yy % 4 === 0 ? 29 : 28;
  const daysInMonth = [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1] ?? 0;
  return dd <= daysInMonth;
}

/**
 * Validates structure and embedded date. The check digit is intentionally not
 * enforced here (some older RFCs do not satisfy it and a false rejection would
 * block onboarding); use `hasValidRfcCheckDigit` as a hint for admin review.
 */
export function parseRfc(input: string): RfcResult {
  const rfc = normalizeRfc(input);
  const match = RFC_PATTERN.exec(rfc);
  if (!match) return { ok: false, issue: 'format' };
  if (GENERIC_RFCS.has(rfc)) return { ok: false, issue: 'generic' };
  const [, , yy, mm, dd] = match;
  if (!isValidRfcDate(Number(yy), Number(mm), Number(dd))) return { ok: false, issue: 'date' };
  return { ok: true, rfc, kind: rfc.length === 12 ? 'moral' : 'fisica' };
}

export function isValidRfc(input: string, kind?: RfcKind): boolean {
  const result = parseRfc(input);
  return result.ok && (kind === undefined || result.kind === kind);
}

const CHECK_DIGIT_ALPHABET = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';

/** SAT check digit (módulo 11) of a structurally valid RFC. */
export function hasValidRfcCheckDigit(input: string): boolean {
  const result = parseRfc(input);
  if (!result.ok) return false;
  // Personas morales are padded to 13 characters with a leading space.
  const padded = result.rfc.padStart(13, ' ');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += CHECK_DIGIT_ALPHABET.indexOf(padded.charAt(i)) * (13 - i);
  }
  const remainder = sum % 11;
  const expected = remainder === 0 ? '0' : 11 - remainder === 10 ? 'A' : String(11 - remainder);
  return padded.charAt(12) === expected;
}
