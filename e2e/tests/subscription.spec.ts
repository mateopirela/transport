import { expect, test } from '@playwright/test';
import { adminBillingCopy, billingCopy } from '@transport/shared';

import { signInOnWeb } from '../support/web';

// Subscription (H3, D30), without Stripe keys: Jorge (Gerente) sees "Piloto
// gratis" and the plans "Por definir", with nothing to buy; Andrea
// (Coordinadora) only sees the state; the admin sets the end of the pilot a
// week away and Jorge gets the pilot_ending banner on every carrier screen.

const b = billingCopy;
const a = adminBillingCopy;

/** A date 7 days from now, as the date input takes it (Mexico City). */
function inAWeek(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

test('the pilot is free, the coordinator only sees it and the admin announces its end', async ({
  page,
  browser,
}) => {
  await signInOnWeb(page, 'jorge');

  await test.step('Jorge sees "Piloto gratis" and the plans "Por definir"', async () => {
    await page.getByRole('link', { name: b.title, exact: true }).first().click();
    await expect(page).toHaveURL(/\/transportista\/suscripcion/u);
    await expect(page.getByTestId('subscription-status')).toHaveText('Piloto gratis');
    await expect(page.getByText(b.pilotBody)).toBeVisible();
    await expect(page.getByText('Hombre camión')).toBeVisible();
    await expect(page.getByText('Empresa transportista').first()).toBeVisible();
    await expect(page.getByText(b.priceToBeDefined).first()).toBeVisible();
    await expect(page.getByRole('button', { name: b.subscribe })).toHaveCount(0);
    await expect(page.getByRole('button', { name: b.managePayment })).toHaveCount(0);
    await expect(page.getByTestId('billing-banner')).toHaveCount(0);
  });

  await test.step('Andrea only sees the state', async () => {
    const andrea = await browser.newPage();
    await signInOnWeb(andrea, 'andrea');
    await andrea.goto('/transportista/suscripcion');
    await expect(andrea.getByTestId('subscription-status')).toHaveText('Piloto gratis');
    await expect(andrea.getByText(b.coordinatorOnly)).toBeVisible();
    await expect(andrea.getByRole('heading', { name: b.plans })).toHaveCount(0);
    await andrea.close();
  });

  const admin = await browser.newPage();
  await test.step('the admin sets the end of the pilot a week away', async () => {
    await signInOnWeb(admin, 'admin');
    await admin.getByRole('link', { name: a.nav }).click();
    await expect(admin).toHaveURL(/\/admin\/suscripciones/u);
    await expect(admin.getByTestId('pilot-mode')).toHaveText(a.pilotOn);
    await admin.getByLabel(a.pilotEndsAt).fill(inAWeek());
    await admin.getByRole('button', { name: a.saveDate }).click();
    await expect(admin.getByText(a.saved)).toBeVisible();
  });

  await test.step('Jorge sees the pilot_ending banner', async () => {
    await page.goto('/transportista');
    const banner = page.getByTestId('billing-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('La prueba piloto gratis termina el');
    await banner.getByRole('link', { name: b.banner.link }).click();
    await expect(page).toHaveURL(/\/transportista\/suscripcion/u);
    await expect(page.getByTestId('subscription-status')).toHaveText('Piloto gratis');
  });

  await test.step('the admin removes the date again', async () => {
    await admin.reload();
    await admin.getByRole('button', { name: a.clearDate }).click();
    await expect(admin.getByText(a.saved)).toBeVisible();
    await admin.close();
    await page.goto('/transportista');
    await expect(page.getByTestId('billing-banner')).toHaveCount(0);
  });
});
