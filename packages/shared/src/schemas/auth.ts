import { z } from 'zod';

import { authMessages as a } from '../copy/auth';
import { validationMessages as m } from '../copy/validation';
import {
  emailField,
  enumField,
  formError,
  onlyWhenValid,
  phoneField,
  requiredText,
} from './common';
import {
  checkRfcMatchesPersonType,
  PERSON_TYPES,
  rfcField,
  type CompanyFormInput,
} from './company';

/** Supabase Auth hashes with bcrypt, which ignores bytes past 72. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Policy for new passwords: 8 to 72 characters with at least a letter and a digit. */
export const newPasswordField = z
  .string({ error: m.required })
  .min(PASSWORD_MIN_LENGTH, { error: a.passwordTooShort(PASSWORD_MIN_LENGTH) })
  .max(PASSWORD_MAX_LENGTH, { error: m.tooLong(PASSWORD_MAX_LENGTH) })
  .refine((value) => /\p{L}/u.test(value) && /\d/u.test(value), { error: a.passwordWeak });

const passwordConfirmationField = z.string({ error: m.required }).min(1, { error: m.required });

function checkPasswordsMatch(
  { password, passwordConfirmation }: { password: string; passwordConfirmation: string },
  ctx: z.RefinementCtx,
): void {
  if (password !== passwordConfirmation) {
    ctx.addIssue({ code: 'custom', message: a.passwordMismatch, path: ['passwordConfirmation'] });
  }
}

export const signInSchema = z.object(
  {
    email: emailField,
    // Existing passwords are not re-validated against the current policy.
    password: z.string({ error: m.required }).min(1, { error: m.required }),
  },
  formError,
);

export const passwordResetRequestSchema = z.object({ email: emailField }, formError);

export const newPasswordSchema = z
  .object(
    { password: newPasswordField, passwordConfirmation: passwordConfirmationField },
    formError,
  )
  .superRefine(checkPasswordsMatch, onlyWhenValid);

/**
 * Web sign-up of a shipper company (D06): the account plus the company data.
 * The person who signs up is the company contact.
 */
export const shipperSignUpSchema = z
  .object(
    {
      fullName: requiredText(120),
      email: emailField,
      phone: phoneField,
      password: newPasswordField,
      passwordConfirmation: passwordConfirmationField,
      personType: enumField(PERSON_TYPES),
      legalName: requiredText(200),
      rfc: rfcField,
    },
    formError,
  )
  .superRefine((values, ctx) => {
    checkPasswordsMatch(values, ctx);
    checkRfcMatchesPersonType(values, ctx);
  }, onlyWhenValid);
export type ShipperSignUpValues = z.output<typeof shipperSignUpSchema>;

/** The company form (./company) that a shipper sign-up describes. */
export function companyFromShipperSignUp(values: ShipperSignUpValues): CompanyFormInput {
  return {
    type: 'shipper',
    personType: values.personType,
    legalName: values.legalName,
    rfc: values.rfc,
    contactName: values.fullName,
    contactEmail: values.email,
    contactPhone: values.phone,
  };
}
