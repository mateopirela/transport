import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatMxn,
  formatTime,
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

describe('date and time in Mexico City', () => {
  // 2026-10-15T00:05:00Z is still 14 Oct at 18:05 in Mexico City (UTC-6).
  const instant = '2026-10-15T00:05:00Z';

  it('formats the local date, not the UTC one', () => {
    expect(formatDate(instant)).toBe('14 oct 2026');
    expect(formatDate(new Date(instant))).toBe('14 oct 2026');
    expect(formatDate(Date.parse(instant))).toBe('14 oct 2026');
  });

  it('formats 24-hour local time', () => {
    expect(formatTime(instant)).toBe('18:05');
    expect(formatTime('2026-10-14T14:00:00Z')).toBe('08:00');
  });

  it('combines date and time', () => {
    expect(formatDateTime(instant)).toBe('14 oct 2026, 18:05');
  });

  it('throws on invalid dates', () => {
    expect(() => formatDate('not a date')).toThrow(RangeError);
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
