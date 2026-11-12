import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  accessSecurityCopy,
  adminCopy,
  authCopy,
  authErrors,
  LOGIN_LOCKOUT,
  secondFactorCopy,
  type Database,
} from '@transport/shared';

import { DEMO_PASSWORD, users } from '../support/demo';
import { supabaseSettings } from '../support/env';
import { DEMO_ADMIN_TOTP_KEY, unusedCode } from '../support/totp';
import { passSecondFactorOnWeb, signInOnWeb } from '../support/web';

// Access security (R5, D46). An admin without a second factor enrolls an
// authenticator app on the first sign-in and gets in; the demo admin, who has
// one, cannot open the panel nor call an admin RPC with the password alone;
// five wrong passwords in a row lock an account for a while. The new admin
// (admin.nuevo@demo.test) is used only here.

const c = secondFactorCopy;
const f = authCopy.fields;

async function typePassword(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(f.identifier).fill(email);
  await page.getByLabel(f.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: authCopy.signIn.submit }).click();
}

test.describe('segundo factor de los administradores (R5)', () => {
  test('un admin sin factor lo configura en su primer ingreso y entra al panel', async ({
    page,
  }) => {
    await typePassword(page, users.adminNew, DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/segundo-factor$/u);
    await expect(page.getByRole('heading', { name: c.enroll.title })).toBeVisible();

    // The panel stays closed until the factor is confirmed.
    await page.goto('/admin/usuarios');
    await expect(page).toHaveURL(/\/segundo-factor\?next=%2Fadmin%2Fusuarios$/u);

    await page.getByRole('button', { name: c.enroll.start }).click();
    await expect(page.getByRole('img', { name: c.enroll.qrAlt })).toBeVisible();
    const key = (await page.getByLabel(c.enroll.secretLabel).textContent())?.trim() ?? '';
    expect(key).toMatch(/^[A-Z2-7]{16,}$/u);

    // A wrong code is told on its field, and the key is still there.
    await page.getByLabel(c.codeLabel).fill('12345');
    await page.getByRole('button', { name: c.enroll.submit }).click();
    await expect(page.getByText(c.errors.codeFormat)).toBeVisible();

    await passSecondFactorOnWeb(page, key, c.enroll.submit);
    await expect(page).toHaveURL(/\/admin\/usuarios$/u);
    await expect(page.getByRole('heading', { name: adminCopy.users.title })).toBeVisible();
  });

  test('un admin con factor no entra al panel ni llama una RPC de admin sin el código', async ({
    page,
  }) => {
    // The database: with the password alone (aal1) an admin RPC is refused.
    const { url, anonKey } = supabaseSettings();
    const client = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await client.auth.signInWithPassword({
      email: users.admin,
      password: DEMO_PASSWORD,
    });
    expect(signedIn.error).toBeNull();
    const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal.data).toMatchObject({ currentLevel: 'aal1', nextLevel: 'aal2' });
    const refused = await client.rpc('admin_list_users', {});
    expect(refused.error?.code).toBe('42501');

    const factors = await client.auth.mfa.listFactors();
    const factorId = factors.data?.totp[0]?.id ?? '';
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId,
      code: await unusedCode(DEMO_ADMIN_TOTP_KEY),
    });
    expect(verified.error).toBeNull();
    const allowed = await client.rpc('admin_list_users', {});
    expect(allowed.error).toBeNull();
    expect((allowed.data ?? []).length).toBeGreaterThan(0);
    await client.auth.signOut();

    // The web: the panel asks for the code and then opens the page asked for.
    await typePassword(page, users.admin, DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/segundo-factor$/u);
    await expect(page.getByRole('heading', { name: c.challenge.title })).toBeVisible();
    await page.goto('/admin/flete');
    await expect(page).toHaveURL(/\/segundo-factor\?next=%2Fadmin%2Fflete$/u);
    await page.getByLabel(c.codeLabel).fill('000000');
    await page.getByRole('button', { name: c.challenge.submit }).click();
    await expect(page.getByText(c.errors.invalidCode)).toBeVisible();
    await passSecondFactorOnWeb(page);
    await expect(page).toHaveURL(/\/admin\/flete$/u);
  });

  test('cinco contraseñas equivocadas seguidas bloquean la cuenta un rato', async ({ page }) => {
    const locked = accessSecurityCopy.accountLocked(LOGIN_LOCKOUT.lockMinutes);
    for (let attempt = 1; attempt < LOGIN_LOCKOUT.maxFailures; attempt += 1) {
      await typePassword(page, users.adminNew, 'Equivocada1');
      await expect(page.getByText(authErrors.invalidCredentials)).toBeVisible();
    }
    await typePassword(page, users.adminNew, 'Equivocada1');
    await expect(page.getByText(locked)).toBeVisible();
    // Even the right password waits for the lock to end.
    await typePassword(page, users.adminNew, DEMO_PASSWORD);
    await expect(page.getByText(locked)).toBeVisible();
    await expect(page).toHaveURL(/\/login/u);
  });

  test('los demás perfiles no notan el segundo factor', async ({ page }) => {
    await signInOnWeb(page, 'jorge');
    await expect(page).toHaveURL(/\/transportista$/u);
    await page.goto('/segundo-factor');
    await expect(page).toHaveURL(/\/transportista$/u);
  });
});
