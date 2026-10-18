import { expect, test } from '@playwright/test';
import { authCopy, carrierWebCopy, invitationUrl } from '@transport/shared';

import { signInAs } from '../support/actors';
import { baseURL } from '../support/env';
import { carrierName } from '../support/demo';
import { waitForConfirmationPath } from '../support/mailpit';
import { signInOnWeb } from '../support/web';

// Invitation links (G1b, G2): Jorge, the Gerente of Transportes Regios,
// issues the links through the same RPC as the app (create_invitation); the
// invited people open them on the web.
//   * A Coordinador creates their account, confirms the email (Mailpit) and
//     joins the company from the same link.
//   * An Operador creates their account with a phone (Edge Function
//     redeem-invitation) and then signs in with that phone.

const f = authCopy.fields;
const c = authCopy.invitation;

/** "Regional Monterrey", the second business unit of TRN (supabase/seed.sql). */
const REGIONAL_MONTERREY = '5eed0009-0000-4000-8000-000000000002';

const run = Date.now();

async function issueLink(kind: 'coordinator' | 'operator'): Promise<string> {
  const jorge = await signInAs('jorge');
  const { data, error } = await jorge.rpc('create_invitation', {
    p_kind: kind,
    p_business_unit_ids: [REGIONAL_MONTERREY],
  });
  const token = data?.[0]?.token;
  if (error || !token) throw new Error(`create_invitation failed: ${error?.message ?? 'no row'}`);
  return new URL(invitationUrl(baseURL, token)).pathname;
}

test('a coordinator joins Transportes Regios from a link', async ({ page }) => {
  const coordinator = {
    fullName: 'Sofía Treviño',
    email: `sofia.e2e.${run}@demo.test`,
    phone: '8155550101',
    password: 'Prueba1234',
  };
  const link = await issueLink('coordinator');

  await test.step('the preview shows the company and the unit', async () => {
    await page.goto(link);
    await expect(page.getByText(/te invita como Coordinador/u)).toContainText(carrierName);
    await expect(page.getByText('Regional Monterrey')).toBeVisible();
  });

  await test.step('create the account and confirm the email', async () => {
    await page.getByLabel(f.fullName).fill(coordinator.fullName);
    await page.getByLabel(f.email).fill(coordinator.email);
    await page.getByLabel(f.phone).fill(coordinator.phone);
    await page.getByLabel(f.password, { exact: true }).fill(coordinator.password);
    await page.getByLabel(f.passwordConfirmation).fill(coordinator.password);
    await page.getByRole('button', { name: c.coordinator.submit }).click();
    await expect(page.getByText(c.coordinator.checkEmail)).toBeVisible();

    await page.goto(await waitForConfirmationPath(coordinator.email));
    await expect(page).toHaveURL(new RegExp(`${link}$`, 'u'));
  });

  await test.step('join the company', async () => {
    await page.getByRole('button', { name: c.coordinator.join }).click();
    await expect(page).toHaveURL(/\/transportista/u);
    await expect(page.getByText(carrierWebCopy.nav.home).first()).toBeVisible();
  });

  await test.step('the link cannot be used twice', async () => {
    await page.goto(link);
    await expect(page.getByText(c.errors.invalid)).toBeVisible();
  });
});

test('an operator creates their account by phone and signs in with it', async ({ page }) => {
  // A different phone on every run: a phone has one account.
  const phone = `81${String(run).slice(-8)}`;
  const operator = { fullName: 'Mario Garza', phone, password: 'Prueba1234' };
  const link = await issueLink('operator');

  await test.step('create the account from the link', async () => {
    await page.goto(link);
    await expect(page.getByText(/te invita como Operador/u)).toContainText(carrierName);
    await page.getByLabel(f.fullName).fill(operator.fullName);
    await page.getByLabel(f.phone).fill(operator.phone);
    await page.getByLabel(f.password, { exact: true }).fill(operator.password);
    await page.getByLabel(f.passwordConfirmation).fill(operator.password);
    await page.getByRole('button', { name: c.operator.submit }).click();
    await expect(page.getByText(c.operator.doneTitle)).toBeVisible();
    await expect(page.getByRole('link', { name: c.operator.openApp })).toBeVisible();
  });

  await test.step('the link cannot be used twice', async () => {
    await page.goto(link);
    await expect(page.getByText(c.errors.invalid)).toBeVisible();
  });

  await test.step('sign in with the phone (the web sends operators to the app)', async () => {
    await signInOnWeb(page, { phone: `+52 ${operator.phone}`, password: operator.password });
    await expect(page).toHaveURL(/\/solo-app/u);
  });
});
