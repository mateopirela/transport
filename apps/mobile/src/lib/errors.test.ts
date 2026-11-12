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
