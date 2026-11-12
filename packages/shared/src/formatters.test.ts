import { describe, expect, it } from 'vitest';

import { formatterCopy } from './copy/ui';
import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatMoney,
  formatMxn,
  formatTime,
  formatDayMonth,
} from './formatters';

// ICU may use narrow no-break spaces; normalize them for readable assertions.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/gu, ' ');

describe('formatMxn', () => {
  it('formats cents as pesos', () => {
    expect(formatMxn(1_234_550)).toBe('$12,345.50');
    expect(formatMxn(0)).toBe('$0.00');
    expect(formatMxn(5)).toBe('$0.05');
    expect(formatMxn(29)).toBe('$0.29');
    expect(plain(formatMxn(-1050))).toBe('-$10.50');
  });

  it('accepts bigint and numeric strings from the database', () => {
    expect(formatMxn(10_000_000_000n)).toBe('$100,000,000.00');
    expect(formatMxn('99')).toBe('$0.99');
  });

  it('refuses fractional cents', () => {
    expect(() => formatMxn(10.5)).toThrow();
  });
});

describe('formatMoney', () => {
  it('drops the cents of a whole amount', () => {
    expect(formatMoney(4_000_000)).toBe('$40,000');
    expect(formatMoney(100)).toBe('$1');
    expect(formatMoney(0)).toBe('$0');
    expect(plain(formatMoney(-970_000))).toBe('-$9,700');
    expect(formatMoney(10_000_000_000n)).toBe('$100,000,000');
    expect(formatMoney('3880000')).toBe('$38,800');
  });

  it('keeps both digits when there are cents', () => {
    expect(formatMoney(1_234_550)).toBe('$12,345.50');
    expect(formatMoney(5)).toBe('$0.05');
    expect(formatMoney(4_000_010)).toBe('$40,000.10');
    expect(plain(formatMoney(-1050))).toBe('-$10.50');
    expect(formatMoney('99')).toBe('$0.99');
  });

  it('never rounds an amount into whole pesos', () => {
    expect(formatMoney(99_999)).toBe('$999.99');
    expect(formatMoney(100_001)).toBe('$1,000.01');
  });

  it('refuses fractional cents, like formatMxn', () => {
    expect(() => formatMoney(10.5)).toThrow();
  });
});

describe('date and time in Mexico City', () => {
  // 2026-10-15T00:05:00Z is still 14 Oct at 18:05 in Mexico City (UTC-6).
  const instant = '2026-10-15T00:05:00Z';

  it('formats the local date, not the UTC one', () => {
    expect(formatDate(instant)).toBe('14 oct 2026');
    expect(formatDate(new Date(instant))).toBe('14 oct 2026');
    expect(formatDate(Date.parse(instant))).toBe('14 oct 2026');
  });

  it('formats 24-hour local time without a leading zero', () => {
    expect(formatTime(instant)).toBe('18:05');
    expect(formatTime('2026-10-14T14:00:00Z')).toBe('8:00');
    expect(formatTime('2026-10-14T06:05:00Z')).toBe('0:05');
  });

  it('combines date and time', () => {
    expect(formatDateTime(instant)).toBe('14 oct 2026, 18:05');
  });

  it('throws on date-only strings (formatCalendarDate is the one for them)', () => {
    expect(() => formatDate('2099-12-31')).toThrow(RangeError);
    expect(() => formatDateTime('2099-12-31')).toThrow(RangeError);
  });

  it('shows "fecha no válida" for a stored date it cannot read instead of throwing', () => {
    // Year 9999 in Mexico City is year 10000 in UTC: Postgres returns it and
    // JavaScript cannot parse it.
    const pastYear9999 = '10000-01-01T05:59:00+00:00';
    for (const value of [pastYear9999, 'not a date', Number.NaN, new Date(Number.NaN)]) {
      expect(formatDate(value)).toBe(formatterCopy.invalidDate);
      expect(formatTime(value)).toBe(formatterCopy.invalidDate);
      expect(formatDateTime(value)).toBe(formatterCopy.invalidDate);
    }
    expect(formatDate('9999-12-31T23:59:00+00:00')).toBe('31 dic 9999');
  });

  it('formats calendar dates without shifting the day', () => {
    expect(formatCalendarDate('2099-12-31')).toBe('31 dic 2099');
    expect(formatCalendarDate('2026-01-01')).toBe('1 ene 2026');
    expect(() => formatCalendarDate('2026-02-30')).toThrow(RangeError);
    expect(() => formatCalendarDate('31/12/2099')).toThrow(RangeError);
  });
});

describe('formatDistance', () => {
  it('uses meters under 1 km and km above', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(0.85)).toBe('850 m');
    expect(formatDistance(45.53)).toBe('45.5 km');
    expect(formatDistance(1234.4)).toBe('1,234 km');
  });

  it('throws on negative or non-finite values', () => {
    expect(() => formatDistance(-1)).toThrow(RangeError);
    expect(() => formatDistance(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('formatDuration', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(180)).toBe('3 h');
    expect(formatDuration(135.4)).toBe('2 h 15 min');
    expect(formatDuration(0)).toBe('0 min');
  });

  it('throws on negative values', () => {
    expect(() => formatDuration(-5)).toThrow(RangeError);
  });
});

describe('formatDayMonth', () => {
  it('writes the day and the short month in Mexico City, without the year', () => {
    expect(formatDayMonth('2026-10-14T18:00:00Z')).toBe('14 oct');
    // 3:00 UTC on the 15th is still the 14th in Mexico City.
    expect(formatDayMonth('2026-10-15T03:00:00Z')).toBe('14 oct');
    expect(formatDayMonth('not a date')).toBe(formatterCopy.invalidDate);
  });
});
