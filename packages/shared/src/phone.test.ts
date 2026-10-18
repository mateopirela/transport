import { describe, expect, it } from 'vitest';

import {
  formatPhone,
  isE164Phone,
  isPhoneAuthEmail,
  normalizeMxPhone,
  phoneAuthEmail,
  resolveLoginIdentifier,
} from './phone';

describe('normalizeMxPhone', () => {
  it.each([
    ['8112345678', '+528112345678'],
    ['81 1234 5678', '+528112345678'],
    ['(81) 1234-5678', '+528112345678'],
    ['+52 81 1234 5678', '+528112345678'],
    ['52 81 1234 5678', '+528112345678'],
    ['+52 1 81 1234 5678', '+528112345678'],
    ['+1 (415) 555-0100', '+14155550100'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizeMxPhone(input)).toBe(expected);
  });

  it.each(['', '811234567', '81123456789', '+0812345678', 'hola', '+52 81 1234 567x'])(
    'rejects %s',
    (input) => {
      expect(normalizeMxPhone(input)).toBeNull();
    },
  );

  it('rejects non-strings', () => {
    expect(normalizeMxPhone(null)).toBeNull();
    expect(normalizeMxPhone(undefined)).toBeNull();
  });
});

describe('isE164Phone and formatPhone', () => {
  it('accepts only E.164', () => {
    expect(isE164Phone('+528112345678')).toBe(true);
    expect(isE164Phone('8112345678')).toBe(false);
    expect(isE164Phone(null)).toBe(false);
  });

  it('formats Mexican numbers in groups and leaves others as they are', () => {
    expect(formatPhone('+528112345678')).toBe('81 1234 5678');
    expect(formatPhone('+14155550100')).toBe('+14155550100');
  });
});

describe('phoneAuthEmail', () => {
  it('derives the synthetic email on the .invalid domain', () => {
    expect(phoneAuthEmail('+528112345678')).toBe('528112345678@tel.transport.invalid');
    expect(isPhoneAuthEmail('528112345678@tel.transport.invalid')).toBe(true);
    expect(isPhoneAuthEmail('528112345678@TEL.TRANSPORT.INVALID')).toBe(true);
    expect(isPhoneAuthEmail('pedro.lopez@demo.test')).toBe(false);
    expect(isPhoneAuthEmail(null)).toBe(false);
  });

  it('refuses a phone that is not in E.164', () => {
    expect(() => phoneAuthEmail('8112345678')).toThrow(RangeError);
  });
});

describe('resolveLoginIdentifier', () => {
  it('keeps an email, lowercased and trimmed', () => {
    expect(resolveLoginIdentifier('  Jorge.Villarreal@Demo.test ')).toBe(
      'jorge.villarreal@demo.test',
    );
  });

  it('turns a phone into its synthetic email', () => {
    expect(resolveLoginIdentifier('81 1000 0013')).toBe('528110000013@tel.transport.invalid');
    expect(resolveLoginIdentifier('+52 81 1000 0013')).toBe('528110000013@tel.transport.invalid');
  });

  it('answers null for anything else', () => {
    expect(resolveLoginIdentifier('')).toBeNull();
    expect(resolveLoginIdentifier('   ')).toBeNull();
    expect(resolveLoginIdentifier('jorge')).toBeNull();
    expect(resolveLoginIdentifier(undefined)).toBeNull();
  });
});
