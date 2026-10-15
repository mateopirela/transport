import { describe, expect, it } from 'vitest';

import { hasValidRfcCheckDigit, isValidRfc, normalizeRfc, parseRfc } from './rfc';

describe('parseRfc', () => {
  it.each([
    ['SAT970701NN3', 'moral'],
    ['WMT970714R10', 'moral'],
    ['BBA830831LJ2', 'moral'],
    ['A&B010203AB1', 'moral'],
    ['GODE561231GR8', 'fisica'],
    ['MUÑO800229AB1', 'fisica'],
    ['ABCD000229XYA', 'fisica'],
  ])('accepts %s as persona %s', (rfc, kind) => {
    expect(parseRfc(rfc)).toEqual({ ok: true, rfc, kind });
  });

  it('normalizes case, spaces and dashes', () => {
    expect(normalizeRfc(' gode-561231 gr8 ')).toBe('GODE561231GR8');
    expect(parseRfc('sat 970701 nn3')).toEqual({ ok: true, rfc: 'SAT970701NN3', kind: 'moral' });
  });

  it.each([
    ['', 'empty'],
    ['SA970701NN3', '2 letters (11 chars)'],
    ['GODEZ561231GR8', '5 letters (14 chars)'],
    ['SAT97070NN3', 'short date'],
    ['S4T970701NN3', 'digit in the name part'],
    ['SAT970701N-3', 'symbol in homoclave'],
    ['SAT970701NNB', 'check digit must be a digit or A'],
    ['SAT9707O1NN3', 'letter O in the date'],
  ])('rejects %s (%s) as a format error', (rfc) => {
    expect(parseRfc(rfc)).toEqual({ ok: false, issue: 'format' });
  });

  it.each([
    'SAT971301NN3', // month 13
    'SAT970001NN3', // month 0
    'SAT970700NN3', // day 0
    'SAT970431NN3', // April 31
    'GODE010229GR8', // Feb 29 in a non-leap year
    'GODE560230GR8', // Feb 30
  ])('rejects the impossible date in %s', (rfc) => {
    expect(parseRfc(rfc)).toEqual({ ok: false, issue: 'date' });
  });

  it('rejects SAT generic RFCs', () => {
    expect(parseRfc('XAXX010101000')).toEqual({ ok: false, issue: 'generic' });
    expect(parseRfc('XEXX010101000')).toEqual({ ok: false, issue: 'generic' });
  });
});

describe('isValidRfc', () => {
  it('checks the expected kind when given', () => {
    expect(isValidRfc('SAT970701NN3')).toBe(true);
    expect(isValidRfc('SAT970701NN3', 'moral')).toBe(true);
    expect(isValidRfc('SAT970701NN3', 'fisica')).toBe(false);
    expect(isValidRfc('GODE561231GR8', 'fisica')).toBe(true);
    expect(isValidRfc('GODE561231GR8', 'moral')).toBe(false);
    expect(isValidRfc('NOT-AN-RFC')).toBe(false);
  });
});

describe('hasValidRfcCheckDigit', () => {
  it.each(['SAT970701NN3', 'WMT970714R10', 'BBA830831LJ2', 'CFE370814QI0', 'GODE561231GR8'])(
    'accepts the check digit of %s',
    (rfc) => {
      expect(hasValidRfcCheckDigit(rfc)).toBe(true);
    },
  );

  it('detects a typo through the check digit', () => {
    expect(hasValidRfcCheckDigit('SAT970701NN4')).toBe(false);
    expect(hasValidRfcCheckDigit('GODE561231GR9')).toBe(false);
    expect(hasValidRfcCheckDigit('AAA010101AAA')).toBe(false);
  });

  it('computes A and 0 check digits', () => {
    // Remainder 1 → "A"; remainder 0 → "0".
    expect(hasValidRfcCheckDigit('ABC010101ACA')).toBe(true);
    expect(hasValidRfcCheckDigit('ABC010101AC0')).toBe(false);
    expect(hasValidRfcCheckDigit('ABC010101AH0')).toBe(true);
    expect(hasValidRfcCheckDigit('ABC010101AHA')).toBe(false);
  });

  it('is false for structurally invalid input', () => {
    expect(hasValidRfcCheckDigit('XYZ')).toBe(false);
  });
});
