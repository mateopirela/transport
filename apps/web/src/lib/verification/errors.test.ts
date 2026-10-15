import { adminCopy, onboardingCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { adminErrorMessage, onboardingErrorMessage } from './errors';

const a = adminCopy.errors;
const o = onboardingCopy.errors;

describe('adminErrorMessage', () => {
  it.each([
    [{ code: '42501', message: 'only admins can review companies' }, a.forbidden],
    [
      { code: '55000', message: 'company is missing required documents: proof_of_address' },
      a.missingDocuments,
    ],
    [{ code: '55000', message: 'document is not pending review (status approved)' }, a.notPending],
    [
      { code: '55000', message: 'cannot suspend a company in status rejected' },
      a.invalidTransition,
    ],
    [{ code: '22023', message: 'this document needs an expiry date' }, a.expiryRequired],
    [{ code: '22023', message: 'document is already expired' }, a.expired],
    [{ code: '22023', message: 'a rejection needs a reason' }, a.generic],
    [{ code: 'PGRST301', message: 'JWT expired' }, a.generic],
    [null, a.generic],
  ])('maps %o', (error, expected) => {
    expect(adminErrorMessage(error)).toBe(expected);
  });
});

describe('onboardingErrorMessage', () => {
  it('maps expiry errors and hides the rest', () => {
    expect(
      onboardingErrorMessage({ code: '22023', message: 'requirement x needs an expiry date' }),
    ).toBe(o.expiryRequired);
    expect(onboardingErrorMessage({ code: '22023', message: 'document is already expired' })).toBe(
      o.expired,
    );
    expect(onboardingErrorMessage({ code: '22023', message: 'invalid storage path' })).toBe(
      o.generic,
    );
    expect(onboardingErrorMessage({ code: '42501', message: 'x' })).toBe(o.generic);
    expect(onboardingErrorMessage(undefined)).toBe(o.generic);
  });
});
