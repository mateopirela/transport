'use server';

// The admin's second factor (R5, D46): enroll an authenticator app (TOTP of
// Supabase Auth) on the first sign-in, or type its code on every new
// session. Both raise the session to aal2, which is_admin() and the web ask
// for (routing.ts). Only admins use it; anybody else gets `notAllowed`.
import { authErrors, secondFactorCopy, totpCodeField } from '@transport/shared';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { formEntries, type FormState } from '../forms';
import { paths, safeNextPath } from '../routing';
import { createClient } from '../supabase/server';
import { loadViewer, type Supabase } from '../viewer';
import { secondFactorErrorMessage } from './second-factor-errors';

const e = secondFactorCopy.errors;

/** The factor being enrolled: shown once, never stored by the web. */
export interface TotpEnrollment {
  factorId: string;
  /** The QR code as an SVG data URI (an image: no script runs in it). */
  qrCode: string;
  /** The base32 key, for typing it by hand. */
  secret: string;
}

export interface EnrollmentState {
  error?: string;
  enrollment?: TotpEnrollment;
}

/** A Supabase client of a signed-in admin, or the message to show instead. */
async function adminClient(): Promise<{ supabase: Supabase } | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  const viewer = await loadViewer(supabase);
  if (viewer?.role !== 'admin') return { error: e.notAllowed };
  return { supabase };
}

/** The QR of Supabase Auth (raw SVG behind the prefix) as a well-formed data URI. */
function svgDataUri(qrCode: string): string {
  const svg = qrCode.replace(/^data:image\/svg\+xml;[^,]*,/u, '');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** After the second factor: the page the admin asked for (when safe) or the panel. */
function afterSecondFactor(next: string | undefined): never {
  redirect(safeNextPath(next) ?? paths.admin);
}

/**
 * "Configurar app autenticadora": a new TOTP factor, unverified until its
 * first code. An unverified one left by an earlier attempt is removed first.
 */
export async function startTotpEnrollment(
  _prev: EnrollmentState,
  _formData: FormData,
): Promise<EnrollmentState> {
  const admin = await adminClient();
  if ('error' in admin) return admin;
  const { supabase } = admin;

  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) return { error: secondFactorErrorMessage(error) };
  if (factors.totp.length > 0) return { error: e.alreadyEnrolled };
  for (const factor of factors.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Transport',
  });
  if (enrollError) return { error: secondFactorErrorMessage(enrollError) };
  return {
    enrollment: {
      factorId: data.id,
      qrCode: svgDataUri(data.totp.qr_code),
      secret: data.totp.secret,
    },
  };
}

const factorIdField = z.uuid();

/** "Activar y entrar": the first code verifies the factor and the session (aal2). */
export async function confirmTotpEnrollment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const entries = formEntries(formData);
  const factorId = factorIdField.safeParse(entries.factorId);
  if (!factorId.success) return { error: e.expired };
  const code = totpCodeField.safeParse(entries.code ?? '');
  if (!code.success) return { fieldErrors: { code: e.codeFormat } };

  const admin = await adminClient();
  if ('error' in admin) return admin;
  const { error } = await admin.supabase.auth.mfa.challengeAndVerify({
    factorId: factorId.data,
    code: code.data,
  });
  if (error) return secondFactorFailure(error);
  return afterSecondFactor(entries.next);
}

/** "Verificar y entrar": the code of the admin's verified factor (aal2). */
export async function verifyTotp(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const code = totpCodeField.safeParse(entries.code ?? '');
  if (!code.success) return { fieldErrors: { code: e.codeFormat } };

  const admin = await adminClient();
  if ('error' in admin) return admin;
  const { supabase } = admin;
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: secondFactorErrorMessage(listError) };
  const factor = factors.totp[0];
  if (!factor) return { error: e.notEnrolled };

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.data,
  });
  if (error) return secondFactorFailure(error);
  return afterSecondFactor(entries.next);
}

/** A wrong code goes on its field; anything else on the form. */
function secondFactorFailure(error: { code?: string | null; message?: string | null }): FormState {
  const message = secondFactorErrorMessage(error);
  return message === e.invalidCode ? { fieldErrors: { code: message } } : { error: message };
}
