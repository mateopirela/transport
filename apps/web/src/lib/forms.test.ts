import { authErrors, shipperSignUpSchema, signInSchema } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { authErrorMessage } from './auth-errors';
import { formEntries, invalidForm, refillValues } from './forms';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  data.append('$ACTION_ID_abc', '');
  data.append('file', new Blob(['x']));
  return data;
}

describe('formEntries', () => {
  it('keeps non-empty text fields and drops files, blanks and React internals', () => {
    expect(formEntries(formData({ email: 'a@b.mx', tradeName: '', $ACTION_KEY: 'k' }))).toEqual({
      email: 'a@b.mx',
    });
  });
});

describe('refillValues', () => {
  it('never sends passwords back', () => {
    expect(
      refillValues({ email: 'a@b.mx', password: 'secreto1', passwordConfirmation: 'secreto1' }),
    ).toEqual({ email: 'a@b.mx' });
  });
});

describe('invalidForm', () => {
  it('keeps the first message per field and the submitted values', () => {
    const entries = { email: 'no-es-correo', password: 'x' };
    const result = signInSchema.safeParse({ email: 'no-es-correo' });
    if (result.success) throw new Error('expected a failed parse');
    const state = invalidForm(result.error, entries);
    expect(state.error).toBeUndefined();
    expect(Object.keys(state.fieldErrors ?? {})).toEqual(['email', 'password']);
    expect(state.values).toEqual({ email: 'no-es-correo' });
  });

  it('reports form-level issues separately', () => {
    const result = shipperSignUpSchema.safeParse(undefined);
    if (result.success) throw new Error('expected a failed parse');
    const state = invalidForm(result.error, {});
    expect(state.error).toBeTypeOf('string');
    expect(state.fieldErrors).toEqual({});
  });
});

describe('authErrorMessage', () => {
  it.each([
    [{ code: 'invalid_credentials' }, authErrors.invalidCredentials],
    [{ code: 'email_not_confirmed' }, authErrors.emailNotConfirmed],
    [{ code: 'user_already_exists' }, authErrors.emailTaken],
    [{ code: 'over_email_send_rate_limit' }, authErrors.rateLimited],
    [{ code: 'otp_expired' }, authErrors.linkInvalid],
    [{ code: '23505' }, authErrors.rfcTaken],
    [{ code: 'something_new' }, authErrors.generic],
    [{ code: null }, authErrors.generic],
    [null, authErrors.generic],
  ])('maps %o', (error, message) => {
    expect(authErrorMessage(error)).toBe(message);
  });
});
