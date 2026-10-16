// Display formatters (D02): es-MX, MXN and America/Mexico_City.
import { APP_CURRENCY, APP_LOCALE, APP_TIME_ZONE } from './constants';
import { toCents } from './money';

const mxn = new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency: APP_CURRENCY });

/** Formats integer MXN cents, e.g. 1234550 → "$12,345.50". */
export function formatMxn(cents: number | bigint | string): string {
  // Amounts are stored and computed in integer cents; the division happens only
  // here, for display, and is exact to two decimals within MAX_AMOUNT_CENTS.
  return mxn.format(toCents(cents) / 100);
}

const dateFormat = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

function toDate(value: Date | string | number): Date {
  // A bare YYYY-MM-DD parses as UTC midnight, which is the previous day in
  // Mexico City. Calendar dates (e.g. a license expiry) use formatCalendarDate.
  if (typeof value === 'string' && CALENDAR_DATE.test(value)) {
    throw new RangeError(`Use formatCalendarDate for date-only values: ${value}`);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

/** Date in Mexico City, e.g. "14 oct 2026". */
export function formatDate(value: Date | string | number): string {
  return dateFormat.format(toDate(value)).replaceAll('.', '');
}

const calendarDateFormat = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** A calendar date without time (Postgres `date`), e.g. "2099-12-31" → "31 dic 2099". */
export function formatCalendarDate(value: string): string {
  const match = CALENDAR_DATE.exec(value);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
  // Reject impossible dates such as 2026-02-30 instead of rolling them over.
  if (!date || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`Invalid calendar date: ${value}`);
  }
  return calendarDateFormat.format(date).replaceAll('.', '');
}

/** 24-hour time in Mexico City without a leading zero, e.g. "8:00" or "18:05". */
export function formatTime(value: Date | string | number): string {
  // Built from parts so Node (web) and Hermes (app) print the same thing: they
  // disagree on padding the hour, so the hour is never padded and minutes always are.
  const parts = timeFormat.formatToParts(toDate(value));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
  return `${hour}:${minute.padStart(2, '0')}`;
}

/** Date and time in Mexico City, e.g. "14 oct 2026, 18:05". */
export function formatDateTime(value: Date | string | number): string {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

const kmShort = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 1 });
const kmLong = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });

/** Distance from kilometers: "850 m", "45.5 km", "1,234 km". */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) throw new RangeError(`Invalid distance: ${km}`);
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${(km < 100 ? kmShort : kmLong).format(km)} km`;
}

/** Duration from minutes: "45 min", "3 h", "2 h 15 min". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError(`Invalid duration: ${minutes}`);
  }
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
