import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { authMessages as a } from '../copy/auth';
import { validationMessages as m } from '../copy/validation';
import {
  carrierSignUpSchema,
  companyFromSignUp,
  coordinatorSignUpSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  registrationSignUpSchema,
  signInSchema,
  signUpRoleForKind,
} from './auth';
import { companyRegistrationSchema, registerCompanyPayload } from './company';

function issues(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

const FISCAL = {
  personType: 'moral',
  legalName: 'Transportes del Norte SA de CV',
  rfc: 'tno-850101-ab1',
  fiscalStreet: 'Av. Constitución',
  fiscalExteriorNumber: '400',
  fiscalInteriorNumber: '',
  fiscalNeighborhood: 'Centro',
  fiscalPostalCode: '64000',
  fiscalMunicipality: 'Monterrey',
  fiscalState: 'Nuevo León',
  legalRepresentativeName: 'Ana López',
};

const SIGN_UP = {
  kind: 'shipper',
  fullName: '  Ana López ',
  email: 'Ana@Empresa.MX',
  phone: '+52 81 1234 5678',
  password: 'carga2026',
  passwordConfirmation: 'carga2026',
  ...FISCAL,
};

describe('signInSchema', () => {
  it('turns an email or a phone into the Auth email and keeps any non-empty password', () => {
    expect(signInSchema.parse({ identifier: ' A@B.MX ', password: 'x' })).toEqual({
      email: 'a@b.mx',
      password: 'x',
    });
    expect(signInSchema.parse({ identifier: '81 1000 0013', password: 'x' })).toEqual({
      email: '528110000013@tel.transport.invalid',
      password: 'x',
    });
  });

  it('requires both fields', () => {
    expect(issues(signInSchema, {})).toEqual({
      identifier: m.loginIdentifier,
      password: m.required,
    });
    expect(issues(signInSchema, { identifier: 'jorge', password: 'x' })).toEqual({
      identifier: m.loginIdentifier,
    });
    expect(issues(signInSchema, undefined)).toEqual({ '': m.required });
  });
});

describe('passwordResetRequestSchema', () => {
  it('validates the email', () => {
    expect(issues(passwordResetRequestSchema, { email: 'no-es-correo' })).toEqual({
      email: m.email,
    });
  });
});

describe('newPasswordSchema', () => {
  it('accepts matching passwords that follow the policy', () => {
    expect(
      newPasswordSchema.safeParse({ password: 'abc12345', passwordConfirmation: 'abc12345' })
        .success,
    ).toBe(true);
  });

  it.each([
    ['abc1', a.passwordTooShort(8)],
    ['abcdefgh', a.passwordWeak],
    ['12345678', a.passwordWeak],
    [`a1${'x'.repeat(71)}`, m.tooLong(72)],
  ])('rejects %s', (password, message) => {
    expect(issues(newPasswordSchema, { password, passwordConfirmation: password })).toEqual({
      password: message,
    });
  });

  it('reports a mismatch on the confirmation', () => {
    expect(
      issues(newPasswordSchema, { password: 'abc12345', passwordConfirmation: 'abc123456' }),
    ).toEqual({ passwordConfirmation: a.passwordMismatch });
  });
});

describe('registrationSignUpSchema (G2)', () => {
  it('normalizes a valid sign-up', () => {
    const values = registrationSignUpSchema.parse(SIGN_UP);
    expect(values).toMatchObject({
      kind: 'shipper',
      fullName: 'Ana López',
      email: 'ana@empresa.mx',
      phone: '+528112345678',
      rfc: 'TNO850101AB1',
      fiscalInteriorNumber: undefined,
      fiscalState: 'Nuevo León',
    });
  });

  it('checks the RFC against the person type and the password confirmation', () => {
    expect(
      issues(registrationSignUpSchema, {
        ...SIGN_UP,
        personType: 'fisica',
        passwordConfirmation: 'otra2026',
      }),
    ).toEqual({ rfc: m.rfcFisica, passwordConfirmation: a.passwordMismatch });
  });

  it('asks a persona moral for its legal representative, and not a persona física', () => {
    expect(issues(registrationSignUpSchema, { ...SIGN_UP, legalRepresentativeName: '' })).toEqual({
      legalRepresentativeName: m.required,
    });
    expect(
      registrationSignUpSchema.safeParse({
        ...SIGN_UP,
        kind: 'owner_operator',
        personType: 'fisica',
        rfc: 'GODE561231GR8',
        legalRepresentativeName: '',
      }).success,
    ).toBe(true);
  });

  it('reports every missing field with Spanish copy', () => {
    expect(issues(registrationSignUpSchema, {})).toEqual({
      kind: m.invalidOption,
      fullName: m.required,
      email: m.email,
      phone: m.phone,
      password: m.required,
      passwordConfirmation: m.required,
      personType: m.invalidOption,
      legalName: m.required,
      rfc: m.rfcFormat,
      fiscalStreet: m.required,
      fiscalExteriorNumber: m.required,
      fiscalNeighborhood: m.required,
      fiscalPostalCode: m.postalCode,
      fiscalMunicipality: m.required,
      fiscalState: m.mxState,
    });
    expect(
      issues(registrationSignUpSchema, {
        ...SIGN_UP,
        fiscalPostalCode: '6400',
        fiscalState: 'Texas',
      }),
    ).toEqual({ fiscalPostalCode: m.postalCode, fiscalState: m.mxState });
  });

  it('builds the company registration and its RPC payload', () => {
    const company = companyFromSignUp(registrationSignUpSchema.parse(SIGN_UP));
    expect(companyRegistrationSchema.parse(company)).toEqual(company);
    expect(registerCompanyPayload(company)).toEqual({
      kind: 'shipper',
      legalName: 'Transportes del Norte SA de CV',
      rfc: 'TNO850101AB1',
      fiscalStreet: 'Av. Constitución',
      fiscalExteriorNumber: '400',
      fiscalInteriorNumber: null,
      fiscalNeighborhood: 'Centro',
      fiscalPostalCode: '64000',
      fiscalMunicipality: 'Monterrey',
      fiscalState: 'Nuevo León',
      legalRepresentativeName: 'Ana López',
      contactName: 'Ana López',
      contactEmail: 'ana@empresa.mx',
      contactPhone: '+528112345678',
    });
  });

  it('maps each kind to its sign-up role', () => {
    expect(signUpRoleForKind('shipper')).toBe('shipper');
    expect(signUpRoleForKind('carrier')).toBe('manager');
    expect(signUpRoleForKind('owner_operator')).toBe('manager');
  });
});

describe('mobile sign-up (B17, G2)', () => {
  const account = {
    fullName: '  Juan Pérez ',
    email: ' Juan@Example.MX ',
    phone: '+52 81 1234 5678',
    password: 'camion2026',
    passwordConfirmation: 'camion2026',
  };

  it('parses a carrier sign-up with its kind', () => {
    expect(carrierSignUpSchema.parse({ ...account, kind: 'owner_operator' })).toEqual({
      kind: 'owner_operator',
      fullName: 'Juan Pérez',
      email: 'juan@example.mx',
      phone: '+528112345678',
      password: 'camion2026',
      passwordConfirmation: 'camion2026',
    });
    expect(
      issues(carrierSignUpSchema, { ...account, kind: 'carrier', passwordConfirmation: 'x2' }),
    ).toEqual({ passwordConfirmation: a.passwordMismatch });
    expect(issues(carrierSignUpSchema, { ...account, kind: 'shipper' })).toEqual({
      kind: m.invalidOption,
    });
  });

  it('parses a coordinator sign-up from an invitation link', () => {
    expect(coordinatorSignUpSchema.parse(account)).toMatchObject({
      email: 'juan@example.mx',
      phone: '+528112345678',
    });
    expect(issues(coordinatorSignUpSchema, { ...account, phone: '12' })).toEqual({
      phone: m.phone,
    });
  });
});
