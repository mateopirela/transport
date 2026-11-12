'use server';

import {
  authCopy,
  authErrors,
  companyFromSignUp,
  companyRegistrationSchema,
  coordinatorSignUpSchema,
  invitationTokenField,
  legalCopy,
  newPasswordSchema,
  passwordResetRequestSchema,
  registrationSignUpSchema,
  signInSchema,
  signUpRoleForKind,
  TERMS_VERSION,
  termsAcceptanceSchema,
} from '@transport/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isIP } from 'node:net';

import { authErrorMessage } from '../auth-errors';
import { siteUrl } from '../env';
import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import {
  homeFor,
  invitationPath,
  needsSecondFactor,
  paths,
  safeNextPath,
  secondFactorPath,
} from '../routing';
import { createClient } from '../supabase/server';
import { loadViewer, type Supabase } from '../viewer';
import {
  completeCompanyPath,
  PENDING_COMPANY_KEY,
  registerCompany,
  registerPendingCompany,
} from './company';

const notConfigured: FormState = { error: authErrors.notConfigured };

/**
 * Sends the user straight to their home. Redirecting to `/` instead would
 * chain a second redirect, which the client router does not follow after a
 * Server Action.
 */
async function redirectHome(supabase: Supabase): Promise<never> {
  const viewer = await loadViewer(supabase);
  redirect(viewer ? homeFor(viewer) : paths.signIn);
}

async function confirmUrl(next?: string): Promise<string> {
  const origin = (await headers()).get('origin');
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  return `${siteUrl(origin)}/auth/confirm${query}`;
}

/** "Correo o teléfono" (G2): a phone becomes the synthetic Auth email of the operator. */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = signInSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorMessage(error), values: refillValues(entries) };

  const companyError = await registerPendingCompany(supabase);
  if (companyError) redirect(completeCompanyPath(companyError));
  const next = safeNextPath(entries.next);
  if (next) {
    // Straight to where `next` ends up (an admin goes through the second
    // factor first, D46): the client router does not follow a second redirect.
    const viewer = await loadViewer(supabase);
    redirect(viewer && needsSecondFactor(viewer) ? secondFactorPath(next) : next);
  }
  await redirectHome(supabase);
  return {};
}

/**
 * Sign-up with the company's fiscal data (G2, D16): a shipper, a carrier
 * company or a hombre-camión (D13). The company is registered once the
 * email is confirmed (registerPendingCompany).
 */
export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = registrationSignUpSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const values = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: await confirmUrl(),
      // Read by the on_auth_user_created trigger (B01): the role follows the
      // kind; `admin` and `operator` are never accepted there. The version of
      // the terms the checkbox accepted is kept by on_auth_user_terms_accepted (I1).
      data: {
        role: signUpRoleForKind(values.kind),
        full_name: values.fullName,
        phone: values.phone,
        terms_version: TERMS_VERSION,
        [PENDING_COMPANY_KEY]: companyFromSignUp(values),
      },
    },
  });
  if (error) return { error: authErrorMessage(error), values: refillValues(entries) };

  // Without email confirmation (not the default) there is a session already.
  if (data.session) {
    const companyError = await registerPendingCompany(supabase);
    if (companyError) redirect(completeCompanyPath(companyError));
    await redirectHome(supabase);
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
  // Supabase answers the same whether or not the account exists, so emails
  // cannot be probed; an error here is a service failure (rate limit, SMTP).
  if (error) return { error: authErrorMessage(error) };
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
  return redirectHome(supabase);
}

/**
 * /completar-registro: the company of a signed-in shipper or Gerente whose
 * registration did not go through at sign-up. The kind comes from the form
 * (a Gerente chooses between a company and hombre-camión); the RPC checks
 * it against the role.
 */
export async function completeCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = companyRegistrationSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const { error } = await registerCompany(supabase, parsed.data);
  if (error) return { error: authErrors[error], values: refillValues(entries) };
  return redirectHome(supabase);
}

/**
 * Coordinator sign-up from an invitation link (G1b, G2): the account is
 * created with role `coordinator` and the confirmation email brings the
 * person back to the link, where they join the company.
 */
export async function signUpCoordinator(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const token = invitationTokenField.safeParse(entries.token);
  if (!token.success) return { error: authErrors.invitationInvalid };
  const parsed = coordinatorSignUpSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const values = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: await confirmUrl(invitationPath(token.data)),
      data: {
        role: 'coordinator',
        full_name: values.fullName,
        phone: values.phone,
        terms_version: TERMS_VERSION,
      },
    },
  });
  if (error) return { error: authErrorMessage(error), values: refillValues(entries) };
  if (data.session) redirect(invitationPath(token.data));
  return { message: authCopy.invitation.coordinator.checkEmail };
}

/** "Unirme": a signed-in Coordinador without a company accepts the link. */
export async function joinCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const token = invitationTokenField.safeParse(entries.token);
  if (!token.success) return { error: authErrors.invitationInvalid };
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const { error } = await supabase.rpc('accept_coordinator_invitation', { p_token: token.data });
  if (error) return { error: authErrorMessage(error) };
  return redirectHome(supabase);
}

/**
 * The first IP of the request as the hosting proxy reports it (Vercel sets
 * x-forwarded-for), or null when there is none. Informational: it goes with
 * the acceptance of the terms (terms_acceptances.ip).
 */
async function requestIp(): Promise<string | null> {
  const first = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return isIP(first) === 0 ? null : first;
}

/**
 * /aceptar-terminos (I1): a signed-in account accepts the current version of
 * the terms (a new one, or an account from before I1) and goes on to `next`
 * or its home.
 */
export async function acceptTerms(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const parsed = termsAcceptanceSchema.safeParse(entries);
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return notConfigured;

  const ip = await requestIp();
  const { error } = await supabase.rpc('accept_terms', {
    p_terms_version: TERMS_VERSION,
    ...(ip ? { p_ip: ip } : {}),
  });
  if (error) return { error: legalCopy.reaccept.error };
  const next = safeNextPath(entries.next);
  if (next) redirect(next);
  return redirectHome(supabase);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect(paths.signIn);
}
