import { describe, expect, it } from 'vitest';

import { emailCodeCopy } from '../copy/access';
import { authMessages } from '../copy/auth';
import { validationMessages } from '../copy/validation';
import {
  ACCOUNT_SIGN_UP_FIELDS,
  accountSignUpMetadata,
  accountSignUpSchema,
  carrierAccountSignUpSchema,
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_VALID_MINUTES,
  emailCodeField,
  emailCodeSchema,
  emailOnlySchema,
  invitedAccountSchema,
  inviteePhoneField,
  operatorAccountFormSchema,
  pendingCompanyKindOf,
  setPasswordSchema,
} from './access';
import { PASSWORD_MIN_LENGTH } from './password';

const account = {
  kind: 'shipper',
  fullName: '  Ana Pérez  ',
  phone: '81 1234 5678',
  email: ' Ana@Empresa.MX ',
  password: 'segura123',
  acceptTerms: 'on',
};

function errorsOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('accountSignUpSchema (D42-E1)', () => {
  it('asks for the kind, five fields and the terms, and nothing else', () => {
    expect(ACCOUNT_SIGN_UP_FIELDS).toEqual([
      'kind',
      'fullName',
      'phone',
      'email',
      'password',
      'acceptTerms',
    ]);
    expect(Object.keys(accountSignUpSchema.shape)).toEqual([...ACCOUNT_SIGN_UP_FIELDS]);
  });

  it('accepts an account and normalizes it as the stepped sign-up did', () => {
    expect(accountSignUpSchema.parse(account)).toEqual({
      kind: 'shipper',
      fullName: 'Ana Pérez',
      phone: '+528112345678',
      email: 'ana@empresa.mx',
      password: 'segura123',
      acceptTerms: true,
    });
  });

  it('does not ask for the password twice nor for the company', () => {
    const parsed = accountSignUpSchema.parse({
      ...account,
      passwordConfirmation: 'otra-cosa-1',
      rfc: 'XAXX010101000',
      legalName: 'No se pide',
    });
    expect(parsed).not.toHaveProperty('passwordConfirmation');
    expect(parsed).not.toHaveProperty('rfc');
    expect(parsed).not.toHaveProperty('legalName');
  });

  it('puts each error on its field', () => {
    const result = accountSignUpSchema.safeParse({
      kind: 'admin',
      fullName: ' ',
      phone: '123',
      email: 'no-es-correo',
      password: 'corta1',
    });
    expect(result.success).toBe(false);
    expect(errorsOf(result)).toEqual({
      kind: validationMessages.invalidOption,
      fullName: validationMessages.required,
      phone: validationMessages.phone,
      email: validationMessages.email,
      password: authMessages.passwordTooShort(PASSWORD_MIN_LENGTH),
      acceptTerms: validationMessages.acceptTerms,
    });
  });

  it('keeps the password policy: a letter and a digit', () => {
    expect(errorsOf(accountSignUpSchema.safeParse({ ...account, password: 'sololetras' }))).toEqual(
      { password: authMessages.passwordWeak },
    );
  });

  it('never accepts admin or operator as a kind', () => {
    for (const kind of ['admin', 'operator', 'coordinator', 'manager', '']) {
      expect(accountSignUpSchema.safeParse({ ...account, kind }).success).toBe(false);
    }
  });
});

describe('carrierAccountSignUpSchema', () => {
  it('signs up a carrier company or a hombre-camión, never a shipper (D06-E1)', () => {
    expect(carrierAccountSignUpSchema.safeParse({ ...account, kind: 'carrier' }).success).toBe(
      true,
    );
    expect(
      carrierAccountSignUpSchema.safeParse({
        ...account,
        kind: 'owner_operator',
        acceptTerms: true,
      }).success,
    ).toBe(true);
    expect(carrierAccountSignUpSchema.safeParse(account).success).toBe(false);
  });
});

describe('invitedAccountSchema', () => {
  it('is the account of a Coordinador: no kind, one password', () => {
    const { kind: _kind, ...invited } = account;
    expect(invitedAccountSchema.parse(invited)).toEqual({
      fullName: 'Ana Pérez',
      phone: '+528112345678',
      email: 'ana@empresa.mx',
      password: 'segura123',
      acceptTerms: true,
    });
    expect(Object.keys(invitedAccountSchema.shape)).not.toContain('passwordConfirmation');
  });
});

describe('accountSignUpMetadata', () => {
  it('writes the role, the person, the terms and the kind as a hint; no company, no password', () => {
    const values = accountSignUpSchema.parse({ ...account, kind: 'owner_operator' });
    const metadata = accountSignUpMetadata(values, '2026-11-01');
    expect(metadata).toEqual({
      role: 'manager',
      full_name: 'Ana Pérez',
      phone: '+528112345678',
      terms_version: '2026-11-01',
      pending_company_kind: 'owner_operator',
    });
    expect(JSON.stringify(metadata)).not.toContain('segura123');
    expect(metadata).not.toHaveProperty('pending_company');
  });

  it('gives a shipper the shipper role and a carrier the manager role', () => {
    const base = { fullName: 'A', phone: '+528112345678' };
    expect(accountSignUpMetadata({ ...base, kind: 'shipper' }, 'v').role).toBe('shipper');
    expect(accountSignUpMetadata({ ...base, kind: 'carrier' }, 'v').role).toBe('manager');
  });
});

describe('pendingCompanyKindOf', () => {
  it('reads the hint back, and nothing from junk (the metadata is user-controlled)', () => {
    expect(pendingCompanyKindOf({ pending_company_kind: 'owner_operator' })).toBe('owner_operator');
    expect(pendingCompanyKindOf({ pending_company_kind: 'admin' })).toBeNull();
    expect(pendingCompanyKindOf({ pending_company_kind: 3 })).toBeNull();
    expect(pendingCompanyKindOf({})).toBeNull();
    expect(pendingCompanyKindOf(null)).toBeNull();
    expect(pendingCompanyKindOf('carrier')).toBeNull();
  });
});

describe('setPasswordSchema', () => {
  it('takes the new password once, under the same policy', () => {
    expect(setPasswordSchema.parse({ password: 'nueva1234' })).toEqual({ password: 'nueva1234' });
    expect(Object.keys(setPasswordSchema.shape)).toEqual(['password']);
    expect(errorsOf(setPasswordSchema.safeParse({ password: 'corta12' }))).toEqual({
      password: authMessages.passwordTooShort(PASSWORD_MIN_LENGTH),
    });
    expect(setPasswordSchema.safeParse({}).success).toBe(false);
  });
});

describe('operatorAccountFormSchema', () => {
  const operator = {
    fullName: 'Omar Operador',
    phone: '8112345678',
    password: 'segura123',
    email: '',
    acceptTerms: true,
  };

  it('is the operator form without the confirmation; an empty email means none', () => {
    expect(operatorAccountFormSchema.parse(operator)).toEqual({
      fullName: 'Omar Operador',
      phone: '+528112345678',
      password: 'segura123',
      email: undefined,
      acceptTerms: true,
    });
    expect(operatorAccountFormSchema.parse({ ...operator, email: ' Omar@Correo.mx ' }).email).toBe(
      'omar@correo.mx',
    );
  });

  it('still needs the phone, the terms and a valid email when one is typed', () => {
    expect(
      errorsOf(
        operatorAccountFormSchema.safeParse({
          ...operator,
          phone: '',
          email: 'x',
          acceptTerms: false,
        }),
      ),
    ).toEqual({
      phone: validationMessages.phone,
      email: validationMessages.email,
      acceptTerms: validationMessages.acceptTerms,
    });
  });
});

describe('inviteePhoneField (D50-2)', () => {
  it('is optional: empty means no phone', () => {
    expect(inviteePhoneField.parse(undefined)).toBeUndefined();
    expect(inviteePhoneField.parse('')).toBeUndefined();
    expect(inviteePhoneField.parse('   ')).toBeUndefined();
  });

  it('normalizes a phone to E.164 and refuses junk', () => {
    expect(inviteePhoneField.parse('(81) 2222-3333')).toBe('+528122223333');
    expect(inviteePhoneField.safeParse('12345').success).toBe(false);
  });
});

describe('emailCodeField (D15-E3)', () => {
  it('is six digits, as supabase/config.toml sends them', () => {
    expect(EMAIL_CODE_LENGTH).toBe(6);
    expect(EMAIL_CODE_VALID_MINUTES).toBe(60);
    expect(emailCodeField.parse('123456')).toBe('123456');
    expect(emailCodeField.parse('012345')).toBe('012345');
  });

  it('drops the spaces and dashes of a pasted code', () => {
    expect(emailCodeField.parse(' 123 456 ')).toBe('123456');
    expect(emailCodeField.parse('123-456')).toBe('123456');
  });

  it('refuses anything else with one message', () => {
    for (const value of [
      '',
      '12345',
      '1234567',
      '12345a',
      '１２３４５６',
      'abcdef',
      123456,
      null,
    ]) {
      const result = emailCodeField.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(emailCodeCopy.invalid);
    }
  });
});

describe('emailCodeSchema and emailOnlySchema', () => {
  it('pairs the code with the email it was sent to', () => {
    expect(emailCodeSchema.parse({ email: ' Ana@Empresa.MX', code: '123 456' })).toEqual({
      email: 'ana@empresa.mx',
      code: '123456',
    });
    expect(errorsOf(emailCodeSchema.safeParse({ email: 'x', code: '1' }))).toEqual({
      email: validationMessages.email,
      code: emailCodeCopy.invalid,
    });
  });

  it('takes the address to resend to', () => {
    expect(emailOnlySchema.parse({ email: 'ANA@empresa.mx' })).toEqual({ email: 'ana@empresa.mx' });
    expect(emailOnlySchema.safeParse({ email: '' }).success).toBe(false);
  });
});
