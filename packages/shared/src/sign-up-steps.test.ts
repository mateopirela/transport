import { describe, expect, it } from 'vitest';

import { authMessages as a } from './copy/auth';
import { validationMessages as m } from './copy/validation';
import {
  REGISTRATION_ACCOUNT_FIELDS,
  registrationAccountStepSchema,
  registrationSignUpSchema,
} from './schemas/auth';
import {
  firstSignUpStepWithError,
  fiscalFieldsFor,
  personTypeOfRfc,
  SIGN_UP_STEPS,
  signUpStepOfField,
  signUpStepStates,
} from './sign-up-steps';

const ACCOUNT = {
  kind: 'carrier',
  fullName: 'Jorge Garza',
  phone: '81 1234 5678',
  email: 'jorge@regios.mx',
  password: 'carga2026',
  passwordConfirmation: 'carga2026',
};

function issues(input: unknown): Record<string, string> {
  const result = registrationAccountStepSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('registrationAccountStepSchema', () => {
  it('checks the fields of step 1 alone, without the fiscal data or the terms', () => {
    expect(issues(ACCOUNT)).toEqual({});
  });

  it('reports each wrong field on its own, with the messages of the full sign-up', () => {
    expect(
      issues({ ...ACCOUNT, kind: 'admin', email: 'jorge', phone: '123', password: 'ab1' }),
    ).toEqual({
      kind: m.invalidOption,
      email: m.email,
      phone: m.phone,
      password: a.passwordTooShort(8),
    });
  });

  it('asks the confirmation to match once every field parses', () => {
    expect(issues({ ...ACCOUNT, passwordConfirmation: 'carga2027' })).toEqual({
      passwordConfirmation: a.passwordMismatch,
    });
  });

  it('covers exactly the step-1 fields, all of them part of the full sign-up', () => {
    expect(Object.keys(registrationAccountStepSchema.shape).sort()).toEqual(
      [...REGISTRATION_ACCOUNT_FIELDS].sort(),
    );
    const full = registrationSignUpSchema.safeParse({});
    const fullFields = full.success ? [] : full.error.issues.map((i) => i.path.join('.'));
    for (const field of REGISTRATION_ACCOUNT_FIELDS) expect(fullFields).toContain(field);
  });
});

describe('signUpStepOfField', () => {
  it('puts the kind and the account in step 1 and the rest in step 2', () => {
    for (const field of REGISTRATION_ACCOUNT_FIELDS) {
      expect(signUpStepOfField(field)).toBe('account');
    }
    for (const field of ['personType', 'legalName', 'rfc', 'fiscalState', 'acceptTerms']) {
      expect(signUpStepOfField(field)).toBe('fiscal');
    }
  });
});

describe('firstSignUpStepWithError', () => {
  it('is null without errors', () => {
    expect(firstSignUpStepWithError(undefined)).toBeNull();
    expect(firstSignUpStepWithError({})).toBeNull();
  });

  it('goes back to step 1 when any of its fields failed, even with errors in step 2', () => {
    expect(firstSignUpStepWithError({ email: a.passwordMismatch })).toBe('account');
    expect(firstSignUpStepWithError({ rfc: 'x', password: 'y' })).toBe('account');
  });

  it('stays in step 2 when only its fields failed', () => {
    expect(firstSignUpStepWithError({ rfc: 'x', acceptTerms: 'y' })).toBe('fiscal');
  });
});

describe('signUpStepStates', () => {
  it('marks the five steps of D42 around the current one', () => {
    expect(SIGN_UP_STEPS).toHaveLength(5);
    expect(signUpStepStates('account').map((s) => s.state)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(signUpStepStates('fiscal').map((s) => s.state)).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });
});

describe('fiscalFieldsFor', () => {
  it('reads "Nombre fiscal" without a representative for a persona física', () => {
    expect(fiscalFieldsFor('fisica')).toEqual({
      legalNameLabel: 'Nombre fiscal',
      withLegalRepresentative: false,
    });
  });

  it('keeps "Razón social" and the representative for a persona moral', () => {
    expect(fiscalFieldsFor('moral')).toEqual({
      legalNameLabel: 'Razón social',
      withLegalRepresentative: true,
    });
  });
});

describe('personTypeOfRfc', () => {
  it('tells the person type by the RFC length', () => {
    expect(personTypeOfRfc('TNO850101AB1')).toBe('moral');
    expect(personTypeOfRfc('GAPJ800101AB1')).toBe('fisica');
  });
});
