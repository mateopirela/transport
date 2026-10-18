// Phones (G2, D15-E1). Profiles keep one format, E.164 (`+52` and 10 digits
// for Mexico), and an operator without an email signs in with a synthetic
// Auth email derived from the phone on a domain that never receives mail
// (`.invalid`, RFC 2606). The database mirrors normalizeMxPhone in
// public.normalize_mx_phone; keep both in step.

/** Domain of the synthetic Auth emails of phone-only operators. */
export const PHONE_AUTH_EMAIL_DOMAIN = 'tel.transport.invalid';

/** E.164: a plus sign and 8 to 15 digits, no leading zero. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/u;

const SEPARATORS = /[\s().-]/gu;

/**
 * The E.164 form of a phone as people type it, or null when it is not one.
 * Mexican numbers may come as 10 digits, with `52` or `+52`, or with the old
 * mobile prefix `+52 1`; other countries only in E.164 already.
 */
export function normalizeMxPhone(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const compact = input.replace(SEPARATORS, '');
  const mexican = /^(?:\+?52)?1?(\d{10})$/u.exec(compact);
  if (mexican) return `+52${mexican[1]}`;
  return E164_PATTERN.test(compact) ? compact : null;
}

/** True for a phone already in E.164. */
export function isE164Phone(value: string | null | undefined): value is string {
  return typeof value === 'string' && E164_PATTERN.test(value);
}

/** `+528112345678` → `81 1234 5678` (Mexico) or the E.164 as is. */
export function formatPhone(e164: string): string {
  const mexican = /^\+52(\d{2})(\d{4})(\d{4})$/u.exec(e164);
  return mexican ? `${mexican[1]} ${mexican[2]} ${mexican[3]}` : e164;
}

/**
 * The Auth email of a phone-only operator: the E.164 digits at the
 * `.invalid` domain, e.g. `528112345678@tel.transport.invalid`. Only the
 * Edge Function `redeem-invitation` creates such accounts.
 */
export function phoneAuthEmail(e164: string): string {
  if (!isE164Phone(e164)) throw new RangeError('phone must be in E.164');
  return `${e164.slice(1)}@${PHONE_AUTH_EMAIL_DOMAIN}`;
}

/** True when an email is a synthetic one of a phone-only operator. */
export function isPhoneAuthEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${PHONE_AUTH_EMAIL_DOMAIN}`);
}

/**
 * What the "Correo o teléfono" sign-in field means to Supabase Auth: an
 * email as typed (lowercased) or the synthetic email of a phone. Null when
 * the input is neither.
 */
export function resolveLoginIdentifier(input: string | null | undefined): string | null {
  const trimmed = input?.trim() ?? '';
  if (trimmed === '') return null;
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const phone = normalizeMxPhone(trimmed);
  return phone ? phoneAuthEmail(phone) : null;
}
