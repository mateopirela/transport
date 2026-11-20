import { mobileErrorCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { toErrorKey } from './errors';

describe('the lock after failed attempts (R5, D46)', () => {
  it('is told apart from a wrong password', () => {
    expect(
      toErrorKey({
        name: 'AuthApiError',
        code: 'invalid_credentials',
        message: 'Too many failed attempts: account temporarily locked',
        status: 400,
      }),
    ).toBe('accountLocked');
    expect(
      toErrorKey({
        name: 'AuthApiError',
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
        status: 400,
      }),
    ).toBe('invalidCredentials');
  });

  it('says for how long', () => {
    expect(mobileErrorCopy.accountLocked).toContain('15 minutos');
  });
});

describe('a repeated RFC (S1, D50-5)', () => {
  it('is recognized by the stable detail of register_company', () => {
    expect(
      toErrorKey({
        code: '23505',
        message: 'rfc already registered (companies_rfc_key)',
        details: 'rfc_taken',
      }),
    ).toBe('rfcTaken');
    expect(toErrorKey({ code: '23505', message: 'otro texto', details: 'rfc_taken' })).toBe(
      'rfcTaken',
    );
  });

  it('is still recognized from a database from before S1, and is not any unique violation', () => {
    expect(
      toErrorKey({
        code: '23505',
        message: 'duplicate key value violates unique constraint "companies_rfc_key"',
      }),
    ).toBe('rfcTaken');
    expect(
      toErrorKey({
        code: '23505',
        message: 'duplicate key value violates unique constraint "vehicles_plate_key"',
      }),
    ).toBe('unknown');
  });
});
