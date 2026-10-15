import { describe, expect, it } from 'vitest';

import { parsePesosToCents, toCents } from './money';

describe('parsePesosToCents', () => {
  it.each([
    ['12500', 1_250_000],
    ['12500.5', 1_250_050],
    ['12500.05', 1_250_005],
    ['$12,500.50', 1_250_050],
    ['$ 1,234,567', 123_456_700],
    ['  0.1 ', 10],
    ['0', 0],
    // Classic float traps stay exact.
    ['0.29', 29],
    ['1.15', 115],
  ])('parses %s as %i cents', (input, cents) => {
    expect(parsePesosToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '-100', '12.345', '1,23', '12,5000', '1.', '.5', '$', '1e5'])(
    'rejects %j',
    (input) => {
      expect(parsePesosToCents(input)).toBeNull();
    },
  );

  it('rejects amounts beyond safe integers', () => {
    expect(parsePesosToCents('99999999999999999')).toBeNull();
  });
});

describe('toCents', () => {
  it('accepts integers as number, bigint or numeric string', () => {
    expect(toCents(1500)).toBe(1500);
    expect(toCents(-1500)).toBe(-1500);
    expect(toCents(1500n)).toBe(1500);
    expect(toCents('1500')).toBe(1500);
  });

  it('rejects fractional, non-numeric and unsafe values', () => {
    expect(() => toCents(15.5)).toThrow(TypeError);
    expect(() => toCents('15.5')).toThrow(TypeError);
    expect(() => toCents(Number.NaN)).toThrow(TypeError);
    expect(() => toCents(2n ** 60n)).toThrow(RangeError);
    expect(() => toCents(-(2n ** 60n))).toThrow(RangeError);
    expect(() => toCents('9007199254740993')).toThrow(TypeError);
  });
});
