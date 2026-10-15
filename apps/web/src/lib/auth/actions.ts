'use server';

import {
  authCopy,
  authErrors,
  companyFormSchema,
  companyFromShipperSignUp,
  newPasswordSchema,
  passwordResetRequestSchema,
  shipperSignUpSchema,
  signInSchema,
} from '@transport/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { authErrorMessage } from '../auth-errors';
import { siteUrl } from '../env';
import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import { paths, safeNextPath } from '../routing';
import { createClient } from '../supabase/server';
import { createCompany, PENDING_COMPANY_KEY, registerPendingCompany } from './company';

const notConfigured: FormState = { error: authErrors.notConfigured };

async function confirmUrl(next?: string): Promise<string> {
  const origin = (await headers()).get('origin');
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  return `${siteUrl(origin)}/auth/confirm${query}`;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = signInSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorMessage(error), values: refillValues(entries) };

  await registerPendingCompany(supabase);
  redirect(safeNextPath(entries.next) ?? paths.home);
}

export async function signUpShipper(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = shipperSignUpSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const values = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: await confirmUrl(),
      // Read by the on_auth_user_created trigger (B01); `admin` is never accepted there.
      data: {
        role: 'shipper',
        full_name: values.fullName,
        phone: values.phone,
        [PENDING_COMPANY_KEY]: companyFromShipperSignUp(values),
      },
    },
  });
  if (error) return { error: authErrorMessage(error), values: refillValues(entries) };

  // Without email confirmation (not the default) there is a session already.
  if (data.session) {
    await registerPendingCompany(supabase);
    redirect(paths.home);
  }
  redirect(paths.checkEmail);
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = passwordResetRequestSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await confirmUrl(paths.resetPassword),
  });
  // Same answer whether or not the account exists, so emails cannot be probed.
  if (error?.code === 'over_email_send_rate_limit') return { error: authErrors.rateLimited };
  return { message: authCopy.forgotPassword.sent };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = newPasswordSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authErrorMessage(error) };
  redirect(paths.home);
}

export async function completeCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = companyFormSchema.safeParse({ ...entries, type: 'shipper' });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const { error } = await createCompany(supabase, parsed.data);
  if (error) return { error, values: refillValues(entries) };
  redirect(paths.home);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect(paths.signIn);
}
