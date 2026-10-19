// Pure helpers of the end-to-end suite (tested in data.test.ts).

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LAST = 'A0123456789';

/**
 * A structurally valid RFC of a persona moral (3 letters + YYMMDD +
 * homoclave), different for each `n` in [0, 14256). The SAT check digit is not
 * enforced by the app (see parseRfc), so it is not computed here.
 */
export function testMoralRfc(n: number): string {
  const i = Math.abs(Math.trunc(n)) % (36 * 36 * LAST.length);
  const homoclave =
    ALNUM.charAt(i % 36) +
    ALNUM.charAt(Math.floor(i / 36) % 36) +
    LAST.charAt(Math.floor(i / 1296));
  return `PRU900101${homoclave}`;
}

/**
 * Value of an `<input type="datetime-local">` (YYYY-MM-DDTHH:mm) for an
 * instant, in the time zone the web app uses for loads (America/Mexico_City).
 */
export function toDateTimeLocal(instant: Date, timeZone = 'America/Mexico_City'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Value of an `<input type="date">` (YYYY-MM-DD) in Mexico City. */
export function toDateInput(instant: Date, timeZone = 'America/Mexico_City'): string {
  return toDateTimeLocal(instant, timeZone).slice(0, 10);
}

/**
 * Path of the sign-up confirmation link in an email body (HTML or text), on
 * any host: the suite opens it on the web app it tests, which may not be the
 * Auth `site_url`. Null when the email has no confirmation link.
 */
export function confirmationPath(body: string): string | null {
  const match =
    /\/auth\/confirm\?token_hash=([A-Za-z0-9_-]+)(?:&amp;|&)type=([a-z_]+)(?:(?:&amp;|&)redirect_to=([^"\s<]*))?/u.exec(
      body,
    );
  if (!match) return null;
  const [, tokenHash, type, redirectTo] = match;
  // The sign-up's emailRedirectTo travels along (G2: back to an invitation
  // link), already URL-encoded by the template.
  const redirect = redirectTo ? `&redirect_to=${decodeEntities(redirectTo)}` : '';
  return `/auth/confirm?token_hash=${tokenHash}&type=${type}${redirect}`;
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/gu, '&').replace(/&#43;/gu, '+').replace(/&#34;/gu, '"');
}

/** Hours from now, as a Date (test fixtures are relative to the run). */
export function hoursFromNow(hours: number, now = new Date()): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}
