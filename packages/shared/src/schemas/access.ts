import { z } from 'zod';

import { emailCodeCopy } from '../copy/access';
import {
  emailField,
  enumField,
  formError,
  mxPhoneField,
  requiredText,
  termsAcceptedField,
} from './common';
import { CARRIER_SIGN_UP_KINDS } from './auth';
import { COMPANY_REGISTRATION_KINDS } from './company';
import { newPasswordField } from './password';

// The access in one step (ola S, plan-acceso.md §S1; D42-E1, D15-E3, D49).
// Built from the fields of ./auth and ./redeem, with no rule of its own:
// what changes is what a form asks for. The password is typed once (the
// button to show it is how the person checks it), the company is registered
// later, inside the panel ("Completa tu cuenta"), and the email is confirmed
// with a code as well as with the link. The schemas of the stepped sign-up
// (R1, R2) stay in ./auth until the web (S2) and the app (S3) stop using them.

/** The fields of an account, whoever creates it. */
const accountFields = {
  fullName: requiredText(120),
  phone: mxPhoneField,
  email: emailField,
  password: newPasswordField,
  acceptTerms: termsAcceptedField,
} as const;

/** The fields of the one-step sign-up, in the order the form shows them. */
export const ACCOUNT_SIGN_UP_FIELDS = [
  'kind',
  'fullName',
  'phone',
  'email',
  'password',
  'acceptTerms',
] as const;
export type AccountSignUpField = (typeof ACCOUNT_SIGN_UP_FIELDS)[number];

/**
 * Creating an account (D42-E1): the kind of user, name, phone, email, one
 * password and the terms. Web: a shipper, a carrier company or a
 * hombre-camión.
 */
export const accountSignUpSchema = z.object(
  { kind: enumField(COMPANY_REGISTRATION_KINDS), ...accountFields } satisfies Record<
    AccountSignUpField,
    z.ZodType
  >,
  formError,
);
export type AccountSignUpValues = z.output<typeof accountSignUpSchema>;

/**
 * The same in the app, which signs up a carrier company or a hombre-camión
 * (D06-E1: the shipper only on the web).
 */
export const carrierAccountSignUpSchema = z.object(
  { kind: enumField(CARRIER_SIGN_UP_KINDS), ...accountFields },
  formError,
);
export type CarrierAccountSignUpValues = z.output<typeof carrierAccountSignUpSchema>;

/** A Coordinador who joins by invitation (D43): the account, without a kind. */
export const invitedAccountSchema = z.object(accountFields, formError);
export type InvitedAccountValues = z.output<typeof invitedAccountSchema>;

/**
 * What the sign-up writes in the user metadata (read by handle_new_user and
 * on_auth_user_terms_accepted): the role, the person and the accepted terms.
 * The kind is only a hint for the fiscal data form of "Completa tu cuenta"
 * (register_company checks it against the role). Since D42-E1 the company
 * does not travel here (`pending_company`), and never a password.
 */
export function accountSignUpMetadata(
  values: Pick<AccountSignUpValues, 'kind' | 'fullName' | 'phone'>,
  termsVersion: string,
): {
  role: 'shipper' | 'manager';
  full_name: string;
  phone: string;
  terms_version: string;
  pending_company_kind: AccountSignUpValues['kind'];
} {
  return {
    role: values.kind === 'shipper' ? 'shipper' : 'manager',
    full_name: values.fullName,
    phone: values.phone,
    terms_version: termsVersion,
    pending_company_kind: values.kind,
  };
}

/** The kind a sign-up left as a hint, or null when there is none or it is not one. */
export function pendingCompanyKindOf(
  metadata: unknown,
): (typeof COMPANY_REGISTRATION_KINDS)[number] | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const parsed = enumField(COMPANY_REGISTRATION_KINDS).safeParse(
    (metadata as Record<string, unknown>).pending_company_kind,
  );
  return parsed.success ? parsed.data : null;
}

/**
 * A new password, typed once: /restablecer, the operator's access reset and
 * the last step of "¿Olvidaste tu contraseña?" in the app (D49).
 */
export const setPasswordSchema = z.object({ password: newPasswordField }, formError);
export type SetPasswordValues = z.output<typeof setPasswordSchema>;

/** The operator's form of an invitation link (D15-E1): the password once. */
export const operatorAccountFormSchema = z.object(
  {
    fullName: requiredText(120),
    phone: mxPhoneField,
    password: newPasswordField,
    // An empty field means no email (the account signs in by phone).
    email: z
      .string()
      .trim()
      .transform((value) => (value === '' ? undefined : value))
      .pipe(emailField.optional())
      .optional(),
    acceptTerms: termsAcceptedField,
  },
  formError,
);
export type OperatorAccountFormValues = z.output<typeof operatorAccountFormSchema>;

/**
 * The phone of an invited operator (D50-2), optional in the form that
 * invites: empty means none. create_invitation normalizes it again.
 */
export const inviteePhoneField = z
  .string()
  .transform((value) => (value.trim() === '' ? undefined : value))
  .pipe(mxPhoneField.optional())
  .optional();

/** Digits of the code in the confirmation and recovery emails (`otp_length`). */
export const EMAIL_CODE_LENGTH = 6;

/** Minutes a code lasts (`otp_expiry` in supabase/config.toml: 3600 s). */
export const EMAIL_CODE_VALID_MINUTES = 60;

/**
 * The code of the email (D15-E3): six digits. Spaces and dashes are dropped,
 * so a code pasted as "123 456" works.
 */
export const emailCodeField = z
  .string({ error: emailCodeCopy.invalid })
  .transform((value) => value.replace(/[\s-]/gu, ''))
  .pipe(
    z
      .string()
      .regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`, 'u'), { error: emailCodeCopy.invalid }),
  );

/** Confirming an email, or the second step of the recovery (D49): email and code. */
export const emailCodeSchema = z.object({ email: emailField, code: emailCodeField }, formError);
export type EmailCodeValues = z.output<typeof emailCodeSchema>;

/** "Reenviar correo" and "Cambiar correo": the address the code goes to. */
export const emailOnlySchema = z.object({ email: emailField }, formError);
