import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { authMessages as a } from '../copy/auth';
import { validationMessages as m } from '../copy/validation';
import {
  accessResetFormSchema,
  accessResetRedeemSchema,
  invitationTokenField,
  operatorRedeemFormSchema,
  operatorRedeemSchema,
} from './redeem';

function issues(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

const TOKEN = 'a'.repeat(43);

describe('invitationTokenField', () => {
  it('accepts a 43-character base64url token and nothing else', () => {
    expect(invitationTokenField.parse(` ${TOKEN} `)).toBe(TOKEN);
    for (const bad of ['', 'abc', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}+`]) {
      expect(issues(invitationTokenField, bad)).toEqual({ '': m.invitationToken });
    }
  });
});

describe('operatorRedeemSchema (Edge Function body)', () => {
  it('normalizes a valid body', () => {
    expect(
      operatorRedeemSchema.parse({
        token: TOKEN,
        fullName: ' Iván Garza ',
        phone: '81 1000 0013',
        password: 'camion2026',
        email: 'Ivan@Example.MX',
      }),
    ).toEqual({
      token: TOKEN,
      fullName: 'Iván Garza',
      phone: '+528110000013',
      password: 'camion2026',
      email: 'ivan@example.mx',
    });
  });

  it('does not need an email', () => {
    expect(
      operatorRedeemSchema.safeParse({
        token: TOKEN,
        fullName: 'Iván',
        phone: '8110000013',
        password: 'camion2026',
      }).success,
    ).toBe(true);
  });

  it('reports each problem with Spanish copy', () => {
    expect(
      issues(operatorRedeemSchema, { token: 'x', phone: '123', password: 'abcdefgh' }),
    ).toEqual({
      token: m.invitationToken,
      fullName: m.required,
      phone: m.phone,
      password: a.passwordWeak,
    });
    expect(issues(operatorRedeemSchema, 'texto')).toEqual({ '': m.required });
  });
});

describe('accessResetRedeemSchema', () => {
  it('needs the token and a password that follows the policy', () => {
    expect(accessResetRedeemSchema.parse({ token: TOKEN, password: 'nueva2026' })).toEqual({
      token: TOKEN,
      password: 'nueva2026',
    });
    expect(issues(accessResetRedeemSchema, { token: TOKEN, password: 'sinnumeros' })).toEqual({
      password: a.passwordWeak,
    });
  });
});

describe('the forms', () => {
  it('check the password confirmation and treat an empty email as none', () => {
    expect(
      operatorRedeemFormSchema.parse({
        fullName: 'Iván',
        phone: '8110000013',
        password: 'camion2026',
        passwordConfirmation: 'camion2026',
        email: '  ',
      }),
    ).toEqual({
      fullName: 'Iván',
      phone: '+528110000013',
      password: 'camion2026',
      passwordConfirmation: 'camion2026',
      email: undefined,
    });
    expect(
      issues(operatorRedeemFormSchema, {
        fullName: 'Iván',
        phone: '8110000013',
        password: 'camion2026',
        passwordConfirmation: 'otra2026',
        email: 'no-es-correo',
      }),
    ).toEqual({ email: m.email });
    expect(
      issues(accessResetFormSchema, { password: 'nueva2026', passwordConfirmation: 'otra2026' }),
    ).toEqual({ passwordConfirmation: a.passwordMismatch });
  });
});
