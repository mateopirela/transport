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
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

/** Date in Mexico City, e.g. "14 oct 2026". */
export function formatDate(value: Date | string | number): string {
  return dateFormat.format(toDate(value)).replaceAll('.', '');
}

/** 24-hour time in Mexico City, e.g. "18:05". */
export function formatTime(value: Date | string | number): string {
  return timeFormat.format(toDate(value));
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
