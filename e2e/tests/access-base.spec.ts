import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  accountSignUpMetadata,
  APP_AUTH_CALLBACK,
  authCopy,
  authErrors,
  EMAIL_CODE_LENGTH,
  emailCodeSchema,
  emailConfirmedCopy,
  TERMS_VERSION,
  type Database,
} from '@transport/shared';

import { testMoralRfc } from '../support/data';
import { supabaseSettings } from '../support/env';
import { waitForEmailCode } from '../support/mailpit';

// S1 (plan-acceso.md): the base of the access without friction. The screens
// that use it are the web's (S2) and the app's (S3); here the pieces are
// checked end to end with what exists today:
//   * the confirmation and recovery emails carry a six-digit code and a link
//     that works on any device (D15-E3), and the code confirms the email,
//     for an account created in the app (PKCE) too; a resend replaces it;
//   * the link of an account created in the app ends on "Correo confirmado",
//     which offers the app;
//   * a repeated RFC is said on the field "RFC" (D50-5).
// The accounts are created as the one-step sign-up will create them: without
// the company in the metadata (D42-E1).

const f = authCopy.fields;
const run = Date.now();
const password = 'Prueba1234';
const SUBJECT_CONFIRM = 'Confirma tu correo';
const SUBJECT_RECOVER = 'Recupera tu contraseña';
/** Transportes Regios del Norte (seed): an RFC that is already registered. */
const TAKEN_RFC = 'TRN120210LP5';

function anonClient(flowType: 'implicit' | 'pkce' = 'implicit') {
  const { url, anonKey } = supabaseSettings();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType },
  });
}

test('the code of the email confirms an account, a resend replaces it, and recovery has one too', async () => {
  const email = `codigo.${run}@demo.test`;
  const client = anonClient();
  const metadata = accountSignUpMetadata(
    { kind: 'shipper', fullName: 'Carla Código', phone: '+528155550141' },
    TERMS_VERSION,
  );

  const first = await test.step('the sign-up sends a code and a link', async () => {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    expect(error).toBeNull();
    expect(data.session).toBeNull();
    const mail = await waitForEmailCode(email, SUBJECT_CONFIRM);
    expect(mail.code).toHaveLength(EMAIL_CODE_LENGTH);
    expect(mail.path).toMatch(/^\/auth\/confirm\?token_hash=[A-Za-z0-9_-]+&type=email/u);
    return mail;
  });

  await test.step('a wrong code is refused and the account stays unconfirmed', async () => {
    const wrong = first.code === '000000' ? '111111' : '000000';
    const { error } = await client.auth.verifyOtp({ email, token: wrong, type: 'email' });
    expect(error?.code).toBe('otp_expired');
    const signIn = await client.auth.signInWithPassword({ email, password });
    expect(signIn.error?.code).toBe('email_not_confirmed');
  });

  const second =
    await test.step('"Reenviar correo" sends a new code; the old one stops working', async () => {
      // [auth.email] max_frequency is 1 s in the local stack.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const { error } = await client.auth.resend({ type: 'signup', email });
      expect(error).toBeNull();
      const mail = await waitForEmailCode(email, SUBJECT_CONFIRM, first.id);
      expect(mail.code).not.toBe(first.code);
      const old = await client.auth.verifyOtp({ email, token: first.code, type: 'email' });
      expect(old.error?.code).toBe('otp_expired');
      return mail;
    });

  await test.step('the code, typed with a space, confirms the email and opens a session', async () => {
    const typed = `${second.code.slice(0, 3)} ${second.code.slice(3)}`;
    const parsed = emailCodeSchema.parse({ email: ` ${email.toUpperCase()} `, code: typed });
    const { data, error } = await client.auth.verifyOtp({
      email: parsed.email,
      token: parsed.code,
      type: 'email',
    });
    expect(error).toBeNull();
    expect(data.session?.user.email_confirmed_at).toBeTruthy();
    // D42-E1: the account exists without a company, and nothing of one travelled in it.
    expect(data.session?.user.user_metadata).not.toHaveProperty('pending_company');
    const { data: profile } = await client.from('profiles').select('role, company_id').single();
    expect(profile).toEqual({ role: 'shipper', company_id: null });
    await client.auth.signOut();
  });

  await test.step('the recovery email carries a code that opens a session to set the password (D49)', async () => {
    const recovery = anonClient();
    expect((await recovery.auth.resetPasswordForEmail(email)).error).toBeNull();
    const mail = await waitForEmailCode(email, SUBJECT_RECOVER);
    expect(mail.path).toMatch(/type=recovery/u);
    const { data, error } = await recovery.auth.verifyOtp({
      email,
      token: mail.code,
      type: 'recovery',
    });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect((await recovery.auth.updateUser({ password: 'Nueva12345' })).error).toBeNull();
    await recovery.auth.signOut();
    const again = await anonClient().auth.signInWithPassword({ email, password: 'Nueva12345' });
    expect(again.error).toBeNull();
  });
});

test('an account created in the app confirms on the web, on any device, and a repeated RFC is said on its field', async ({
  page,
}) => {
  const email = `app.${run}@demo.test`;
  const metadata = accountSignUpMetadata(
    { kind: 'carrier', fullName: 'Gerardo App', phone: '+528155550142' },
    TERMS_VERSION,
  );

  const mail = await test.step('the app signs up with PKCE and its own callback', async () => {
    const app = anonClient('pkce');
    const { data, error } = await app.auth.signUp({
      email,
      password,
      options: { data: metadata, emailRedirectTo: APP_AUTH_CALLBACK },
    });
    expect(error).toBeNull();
    expect(data.session).toBeNull();
    const sent = await waitForEmailCode(email, SUBJECT_CONFIRM);
    // The link is the web's, not the app's deep link: it opens on any device.
    expect(sent.html).not.toContain(`href="${APP_AUTH_CALLBACK}`);
    expect(sent.path).toMatch(/^\/auth\/confirm\?token_hash=pkce_/u);
    return sent;
  });

  await test.step('the link confirms the email in this browser and offers the app', async () => {
    await page.goto(mail.path ?? '/');
    await expect(page).toHaveURL(/\/correo-confirmado$/u);
    await expect(page.getByRole('heading', { name: emailConfirmedCopy.title })).toBeVisible();
    await expect(page.getByRole('link', { name: emailConfirmedCopy.openApp })).toHaveAttribute(
      'href',
      APP_AUTH_CALLBACK,
    );
  });

  await test.step('the Gerente goes on in the web: without a company, to its fiscal data', async () => {
    await page.getByRole('link', { name: emailConfirmedCopy.continueOnWeb }).click();
    await expect(page).toHaveURL(/\/completar-registro/u);
    await expect(page.getByLabel(f.fullName)).toHaveValue('Gerardo App');
  });

  await test.step('a repeated RFC is said on the field, and nothing typed is lost', async () => {
    await page.getByLabel(f.personTypeMoral).check();
    await page.getByLabel(f.legalName).fill(`Fletes App ${run}, S.A. de C.V.`);
    await page.getByLabel(f.rfc).fill(TAKEN_RFC);
    await page.getByLabel(f.legalRepresentativeName).fill('Gerardo App');
    await page.getByLabel(f.fiscalStreet).fill('Av. Constitución');
    await page.getByLabel(f.fiscalExteriorNumber).fill('400');
    await page.getByLabel(f.fiscalNeighborhood).fill('Centro');
    await page.getByLabel(f.fiscalPostalCode).fill('64000');
    await page.getByLabel(f.fiscalMunicipality).fill('Monterrey');
    await page.getByLabel(f.fiscalState).selectOption('Nuevo León');
    await page.getByLabel(f.phone).fill('8155550142');
    await page.getByLabel(f.email).fill(email);
    await page.getByRole('button', { name: authCopy.completeCompany.submit }).click();

    const rfc = page.getByLabel(f.rfc);
    await expect(rfc).toHaveAttribute('aria-invalid', 'true');
    await expect(rfc).toHaveAccessibleDescription(authErrors.rfcTaken);
    await expect(rfc).toHaveValue(TAKEN_RFC);
    await expect(page.getByLabel(f.fiscalStreet)).toHaveValue('Av. Constitución');
    await expect(page.getByLabel(f.fiscalState)).toHaveValue('Nuevo León');
    await expect(page).toHaveURL(/\/completar-registro/u);
  });

  await test.step('with a free RFC the company is registered', async () => {
    await page.getByLabel(f.rfc).fill(testMoralRfc(run + 31));
    await page.getByRole('button', { name: authCopy.completeCompany.submit }).click();
    await expect(page).toHaveURL(/\/cuenta-en-revision/u);
  });

  await test.step('the link works once: opened again, it says so', async () => {
    const other = await page.context().browser()?.newContext();
    if (!other) throw new Error('no browser');
    const second = await other.newPage();
    await second.goto(mail.path ?? '/');
    await expect(second).toHaveURL(/\/login\?error=enlace/u);
    await other.close();
  });
});
