import { describe, expect, it } from 'vitest';

import { isRfcTakenError, RFC_TAKEN_DETAIL, RFC_TAKEN_FIELD } from './registration-errors';

describe('isRfcTakenError (D50-5)', () => {
  it('recognizes the stable answer of register_company', () => {
    expect(
      isRfcTakenError({
        code: '23505',
        message: 'rfc already registered (companies_rfc_key)',
        details: RFC_TAKEN_DETAIL,
      }),
    ).toBe(true);
    expect(isRfcTakenError({ code: '23505', message: 'otro texto', details: 'rfc_taken' })).toBe(
      true,
    );
  });

  it('still recognizes the bare unique violation of a database from before S1', () => {
    expect(
      isRfcTakenError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "companies_rfc_key"',
        details: 'Key (rfc)=(XAXX010101000) already exists.',
      }),
    ).toBe(true);
  });

  it('is not any unique violation, nor the detail under another code', () => {
    expect(
      isRfcTakenError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "vehicles_plate_key"',
      }),
    ).toBe(false);
    expect(isRfcTakenError({ code: '22023', details: 'rfc_taken' })).toBe(false);
    expect(isRfcTakenError({ code: '23505' })).toBe(false);
    expect(isRfcTakenError({})).toBe(false);
    expect(isRfcTakenError(null)).toBe(false);
    expect(isRfcTakenError(undefined)).toBe(false);
  });

  it('belongs to the RFC field', () => {
    expect(RFC_TAKEN_FIELD).toBe('rfc');
  });
});
