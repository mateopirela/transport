import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { resolveLoginIdentifier } from '../phone';
import {
  emailField,
  enumField,
  formError,
  mxPhoneField,
  onlyWhenValid,
  requiredText,
} from './common';
import {
  checkLegalRepresentative,
  checkRfcMatchesPersonType,
  COMPANY_REGISTRATION_KINDS,
  companyFiscalFields,
  type CompanyRegistrationValues,
} from './company';
import { checkPasswordsMatch, newPasswordField, passwordConfirmationField } from './password';

export {
  checkPasswordsMatch,
  newPasswordField,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './password';

/**
 * "Correo o teléfono" (G2, D15-E1): an email as typed, or a phone that
 * becomes the synthetic Auth email of a phone-only operator.
 */
export const loginIdentifierField = z
  .string({ error: m.loginIdentifier })
  .transform((value, ctx) => {
    const email = resolveLoginIdentifier(value);
    if (email) return email;
    ctx.addIssue({ code: 'custom', message: m.loginIdentifier });
    return z.NEVER;
  });

export const signInSchema = z
  .object(
    {
      identifier: loginIdentifierField,
      // Existing passwords are not re-validated against the current policy.
      password: z.string({ error: m.required }).min(1, { error: m.required }),
    },
    formError,
  )
  .transform(({ identifier, password }) => ({ email: identifier, password }));
export type SignInValues = z.output<typeof signInSchema>;

export const passwordResetRequestSchema = z.object({ email: emailField }, formError);

export const newPasswordSchema = z
  .object(
    { password: newPasswordField, passwordConfirmation: passwordConfirmationField },
    formError,
  )
  .superRefine(checkPasswordsMatch, onlyWhenValid);

/** The person who signs up: name, email, phone (E.164) and password. */
const accountFields = {
  fullName: requiredText(120),
  email: emailField,
  phone: mxPhoneField,
  password: newPasswordField,
  passwordConfirmation: passwordConfirmationField,
} as const;

/**
 * Web sign-up (G2): the account plus the company's fiscal data, as a
 * shipper, a carrier company or a hombre-camión (D13, D16). The person who
 * signs up is the company contact.
 */
export const registrationSignUpSchema = z
  .object(
    { kind: enumField(COMPANY_REGISTRATION_KINDS), ...accountFields, ...companyFiscalFields },
    formError,
  )
  .superRefine((values, ctx) => {
    checkPasswordsMatch(values, ctx);
    checkRfcMatchesPersonType(values, ctx);
    checkLegalRepresentative(values, ctx);
  }, onlyWhenValid);
export type RegistrationSignUpValues = z.output<typeof registrationSignUpSchema>;

/** The company registration (./company) a web sign-up describes. */
export function companyFromSignUp(values: RegistrationSignUpValues): CompanyRegistrationValues {
  const {
    fullName,
    email,
    phone,
    password: _password,
    passwordConfirmation: _confirmation,
    ...company
  } = values;
  return { ...company, contactName: fullName, contactEmail: email, contactPhone: phone };
}

/** The sign-up role of a registration kind (read by handle_new_user). */
export function signUpRoleForKind(
  kind: (typeof COMPANY_REGISTRATION_KINDS)[number],
): 'shipper' | 'manager' {
  return kind === 'shipper' ? 'shipper' : 'manager';
}

// --- Mobile app (B17, G2) --------------------------------------------------

/** Kinds a carrier may sign up as in the app (the company comes next). */
export const CARRIER_SIGN_UP_KINDS = ['carrier', 'owner_operator'] as const;
export type CarrierSignUpKind = (typeof CARRIER_SIGN_UP_KINDS)[number];

/** Carrier self sign-up (mobile). The company is registered after the account exists. */
export const carrierSignUpSchema = z
  .object({ kind: enumField(CARRIER_SIGN_UP_KINDS), ...accountFields }, formError)
  .superRefine(checkPasswordsMatch, onlyWhenValid);
export type CarrierSignUpValues = z.output<typeof carrierSignUpSchema>;

/** Coordinator sign-up from an invitation link (G1b, G2): web and app. */
export const coordinatorSignUpSchema = z
  .object(accountFields, formError)
  .superRefine(checkPasswordsMatch, onlyWhenValid);
export type CoordinatorSignUpValues = z.output<typeof coordinatorSignUpSchema>;
