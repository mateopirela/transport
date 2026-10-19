import { z } from 'zod';

import { authMessages as a } from '../copy/auth';
import { validationMessages as m } from '../copy/validation';

// Password policy of every sign-up and reset (web, app and the Edge Function
// redeem-invitation, which imports this file alone). Supabase Auth enforces
// the same minimum and "letters and digits" rule (supabase/config.toml).

/** Supabase Auth hashes with bcrypt, which ignores bytes past 72. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Policy for new passwords: 8 to 72 characters with at least a letter and a digit. */
export const newPasswordField = z
  .string({ error: m.required })
  .min(PASSWORD_MIN_LENGTH, { error: a.passwordTooShort(PASSWORD_MIN_LENGTH) })
  .max(PASSWORD_MAX_LENGTH, { error: m.tooLong(PASSWORD_MAX_LENGTH) })
  .refine((value) => /\p{L}/u.test(value) && /\d/u.test(value), { error: a.passwordWeak });

export const passwordConfirmationField = z
  .string({ error: m.required })
  .min(1, { error: m.required });

export function checkPasswordsMatch(
  { password, passwordConfirmation }: { password: string; passwordConfirmation: string },
  ctx: z.RefinementCtx,
): void {
  if (password !== passwordConfirmation) {
    ctx.addIssue({ code: 'custom', message: a.passwordMismatch, path: ['passwordConfirmation'] });
  }
}
