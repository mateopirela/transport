import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { INVITATION_TOKEN_PATTERN } from '../invitation-link';
import { emailField, formError, mxPhoneField, onlyWhenValid, requiredText } from './common';
import { checkPasswordsMatch, newPasswordField, passwordConfirmationField } from './password';

// Operator invitation links (G2, D15-E1). The Edge Function redeem-invitation
// validates its body with these schemas; the web and the app use the *Form
// variants (with the password confirmation) before calling it. This file
// stays light on imports because the Edge Function maps each one by hand.

/** A 43-character base64url invitation token (G1b). */
export const invitationTokenField = z
  .string({ error: m.invitationToken })
  .trim()
  .regex(INVITATION_TOKEN_PATTERN, { error: m.invitationToken });

/** Body of redeem-invitation for an `operator` link: the new account. */
export const operatorRedeemSchema = z.object(
  {
    token: invitationTokenField,
    fullName: requiredText(120),
    phone: mxPhoneField,
    password: newPasswordField,
    email: emailField.optional(),
  },
  formError,
);
export type OperatorRedeemValues = z.output<typeof operatorRedeemSchema>;

/** Body of redeem-invitation for an `operator_access_reset` link: the new password. */
export const accessResetRedeemSchema = z.object(
  { token: invitationTokenField, password: newPasswordField },
  formError,
);
export type AccessResetRedeemValues = z.output<typeof accessResetRedeemSchema>;

/** Kinds of link the Edge Function redeems (never `coordinator`). */
export const REDEEMABLE_KINDS = ['operator', 'operator_access_reset'] as const;
export type RedeemableKind = (typeof REDEEMABLE_KINDS)[number];

/** The operator form (name, phone, password twice, optional email). */
export const operatorRedeemFormSchema = z
  .object(
    {
      fullName: requiredText(120),
      phone: mxPhoneField,
      password: newPasswordField,
      passwordConfirmation: passwordConfirmationField,
      // An empty field means no email (the account signs in by phone).
      email: z
        .string()
        .trim()
        .transform((value) => (value === '' ? undefined : value))
        .pipe(emailField.optional())
        .optional(),
    },
    formError,
  )
  .superRefine(checkPasswordsMatch, onlyWhenValid);
export type OperatorRedeemFormValues = z.output<typeof operatorRedeemFormSchema>;

/** The access reset form (password twice). */
export const accessResetFormSchema = z
  .object(
    { password: newPasswordField, passwordConfirmation: passwordConfirmationField },
    formError,
  )
  .superRefine(checkPasswordsMatch, onlyWhenValid);
export type AccessResetFormValues = z.output<typeof accessResetFormSchema>;
