import {
  companyRegistrationSchema,
  REGISTRATION_ACCOUNT_FIELDS,
  registrationSignUpSchema,
  signUpStepOfField,
} from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { validateForm } from './forms';
import {
  companyErrorField,
  companyFormValues,
  EMPTY_SIGN_UP,
  firstFieldWithError,
  isCarrierKind,
  personTypeForKind,
  SIGN_UP_FIELD_ORDER,
  signUpErrorField,
  signUpInput,
  signUpStepIndex,
  type SignUpFormValues,
} from './sign-up';

const FILLED: SignUpFormValues = {
  ...EMPTY_SIGN_UP,
  kind: 'owner_operator',
  fullName: 'José Sánchez',
  phone: '81 1234 5678',
  email: 'jose@camion.mx',
  password: 'camion2026',
  passwordConfirmation: 'camion2026',
  personType: 'fisica',
  legalName: 'José Sánchez Méndez',
  rfc: 'SAMJ800101AB1',
  legalRepresentativeName: 'Alguien más',
  fiscalStreet: 'Av. Constitución',
  fiscalExteriorNumber: '100',
  fiscalNeighborhood: 'Centro',
  fiscalPostalCode: '64000',
  fiscalMunicipality: 'Monterrey',
  fiscalState: 'Nuevo León',
  acceptTerms: true,
};

describe('the sign-up of the app (D42, R2)', () => {
  it('starts as a carrier company, persona moral, with nothing typed', () => {
    expect(EMPTY_SIGN_UP.kind).toBe('carrier');
    expect(EMPTY_SIGN_UP.personType).toBe('moral');
    expect(EMPTY_SIGN_UP.password).toBe('');
    expect(EMPTY_SIGN_UP.acceptTerms).toBe(false);
  });

  it('takes a hombre-camión as a persona física until the person picks', () => {
    expect(personTypeForKind('owner_operator')).toBe('fisica');
    expect(personTypeForKind('carrier')).toBe('moral');
  });

  it('never sends a legal representative for a persona física', () => {
    expect(signUpInput(FILLED).legalRepresentativeName).toBe('');
    const moral = { ...FILLED, personType: 'moral' as const, rfc: 'TRN010101AB1' };
    expect(signUpInput(moral).legalRepresentativeName).toBe('Alguien más');
  });

  it('validates with the web sign-up schema, without new rules', () => {
    const parsed = validateForm(registrationSignUpSchema, signUpInput(FILLED));
    expect(parsed.ok).toBe(true);
    const moral = validateForm(
      registrationSignUpSchema,
      signUpInput({
        ...FILLED,
        personType: 'moral',
        rfc: 'TRN010101AB1',
        legalRepresentativeName: '',
      }),
    );
    expect(moral.ok ? {} : moral.errors).toHaveProperty('legalRepresentativeName');
  });

  it('lists every field once, step 1 first, in the order of the screen', () => {
    expect(new Set(SIGN_UP_FIELD_ORDER).size).toBe(SIGN_UP_FIELD_ORDER.length);
    expect([...SIGN_UP_FIELD_ORDER].sort()).toEqual(Object.keys(EMPTY_SIGN_UP).sort());
    const steps = SIGN_UP_FIELD_ORDER.map((field) => signUpStepOfField(field));
    const lastAccount = steps.lastIndexOf('account');
    expect(steps.slice(0, lastAccount + 1).every((step) => step === 'account')).toBe(true);
    expect(SIGN_UP_FIELD_ORDER.slice(0, lastAccount + 1)).toEqual(
      expect.arrayContaining([...REGISTRATION_ACCOUNT_FIELDS]),
    );
  });

  it('finds the first field with an error, as the screen shows them', () => {
    expect(firstFieldWithError({})).toBeNull();
    expect(firstFieldWithError({ rfc: 'x', email: 'y', acceptTerms: 'z' })).toBe('email');
    expect(firstFieldWithError({ fiscalState: 'x', acceptTerms: 'z' })).toBe('fiscalState');
    expect(firstFieldWithError({ contactPhone: 'x' }, ['rfc', 'contactPhone'])).toBe(
      'contactPhone',
    );
  });

  it('places the two form steps among the five of D42', () => {
    expect(signUpStepIndex('account')).toBe(0);
    expect(signUpStepIndex('fiscal')).toBe(1);
  });

  it('puts a server error on its field, and in its step', () => {
    expect(signUpErrorField('userAlreadyExists')).toBe('email');
    expect(signUpErrorField('weakPassword')).toBe('password');
    expect(signUpErrorField('phoneInvalid')).toBe('phone');
    expect(signUpErrorField('network')).toBeNull();
    expect(signUpErrorField('rateLimited')).toBeNull();
    expect(signUpStepOfField('email')).toBe('account');
    expect(companyErrorField('rfcTaken')).toBe('rfc');
    expect(companyErrorField('unknown')).toBeNull();
  });

  it('only registers carrier kinds in the app (D06-E1)', () => {
    expect(isCarrierKind('carrier')).toBe(true);
    expect(isCarrierKind('owner_operator')).toBe(true);
    expect(isCarrierKind('shipper')).toBe(false);
  });

  it('turns a saved company back into the form, which validates as it was', () => {
    const company = companyRegistrationSchema.parse({
      kind: 'carrier',
      personType: 'moral',
      legalName: 'Transportes Regios del Norte',
      rfc: 'TRN010101AB1',
      fiscalStreet: 'Av. Constitución',
      fiscalExteriorNumber: '100',
      fiscalNeighborhood: 'Centro',
      fiscalPostalCode: '64000',
      fiscalMunicipality: 'Monterrey',
      fiscalState: 'Nuevo León',
      legalRepresentativeName: 'Jorge Villarreal',
      contactName: 'Jorge Villarreal',
      contactEmail: 'jorge@regios.mx',
      contactPhone: '81 1234 5678',
    });
    const form = companyFormValues(company);
    expect(form.fiscalInteriorNumber).toBe('');
    expect(companyRegistrationSchema.parse(form)).toEqual(company);
  });
});
