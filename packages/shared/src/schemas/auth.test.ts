import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { authMessages as a } from '../copy/auth';
import { validationMessages as m } from '../copy/validation';
import {
  companyFromShipperSignUp,
  newPasswordSchema,
  passwordResetRequestSchema,
  shipperSignUpSchema,
  signInSchema,
} from './auth';
import { companyFormSchema } from './company';

function issues(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

const SIGN_UP = {
  fullName: '  Ana López ',
  email: 'Ana@Empresa.MX',
  phone: '+52 81 1234 5678',
  password: 'carga2026',
  passwordConfirmation: 'carga2026',
  personType: 'moral',
  legalName: 'Transportes del Norte SA de CV',
  rfc: 'tno-850101-ab1',
};

describe('signInSchema', () => {
  it('normalizes the email and accepts any non-empty password', () => {
    expect(signInSchema.parse({ email: ' A@B.MX ', password: 'x' })).toEqual({
      email: 'a@b.mx',
      password: 'x',
    });
  });

  it('requires both fields', () => {
    expect(issues(signInSchema, {})).toEqual({ email: m.email, password: m.required });
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

describe('shipperSignUpSchema', () => {
  it('normalizes a valid sign-up', () => {
    const values = shipperSignUpSchema.parse(SIGN_UP);
    expect(values).toMatchObject({
      fullName: 'Ana López',
      email: 'ana@empresa.mx',
      phone: '8112345678',
      rfc: 'TNO850101AB1',
    });
  });

  it('checks the RFC against the person type and the password confirmation', () => {
    expect(
      issues(shipperSignUpSchema, {
        ...SIGN_UP,
        personType: 'fisica',
        passwordConfirmation: 'otra2026',
      }),
    ).toEqual({ rfc: m.rfcFisica, passwordConfirmation: a.passwordMismatch });
  });

  it('reports every missing field with Spanish copy', () => {
    expect(issues(shipperSignUpSchema, {})).toEqual({
      fullName: m.required,
      email: m.email,
      phone: m.phone,
      password: m.required,
      passwordConfirmation: m.required,
      personType: m.invalidOption,
      legalName: m.required,
      rfc: m.rfcFormat,
    });
  });

  it('builds a valid shipper company form', () => {
    const company = companyFromShipperSignUp(shipperSignUpSchema.parse(SIGN_UP));
    expect(companyFormSchema.parse(company)).toEqual({
      type: 'shipper',
      personType: 'moral',
      legalName: 'Transportes del Norte SA de CV',
      rfc: 'TNO850101AB1',
      contactName: 'Ana López',
      contactEmail: 'ana@empresa.mx',
      contactPhone: '8112345678',
    });
  });
});
