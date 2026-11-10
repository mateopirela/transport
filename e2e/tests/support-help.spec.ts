import { expect, test, type Page } from '@playwright/test';
import { adminSettingsCopy, supportCopy, uiCopy } from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Pilot support (I2, D41): without a number "Ayuda" does not show; the admin
// sets JP's WhatsApp (a made-up test number here) and the hours in
// /admin/ajustes; then "Ayuda" in the account menu opens wa.me with a message
// that says the role and, on a trip's page, its folio; the hombre camión
// writes as "Hombre camión". The admin removes the number at the end.

const a = adminSettingsCopy;
const PHONE = '81 5550 0100';
const E164_DIGITS = '528155500100';
const HOURS = 'Lunes a sábado, 8:00 a 20:00';

/** Opens the account menu and returns the "Ayuda" link (it may not exist). */
async function openHelp(page: Page) {
  await page.getByRole('button', { name: uiCopy.account }).click();
  return page.getByTestId('support-help');
}

/** The WhatsApp message of an "Ayuda" link. */
async function messageOf(page: Page): Promise<string> {
  const href = await page.getByTestId('support-help').getAttribute('href');
  expect(href).not.toBeNull();
  const url = new URL(href as string);
  expect(url.origin).toBe('https://wa.me');
  expect(url.pathname).toBe(`/${E164_DIGITS}`);
  return url.searchParams.get('text') ?? '';
}

test('"Ayuda" opens the support WhatsApp only when the admin set the number', async ({
  page,
  browser,
}) => {
  await signInOnWeb(page, 'ana');

  await test.step('without a number there is no "Ayuda"', async () => {
    await page.goto('/cliente');
    await expect(await openHelp(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  const admin = await browser.newPage();
  await test.step('the admin sets the number and the hours', async () => {
    await signInOnWeb(admin, 'admin');
    await admin.goto('/admin/ajustes');
    await expect(admin.getByRole('link', { name: a.nav, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(admin.getByText(a.whatsappNone)).toBeVisible();
    // "Ayuda" is for the users: the admin is the support.
    await expect(await openHelp(admin)).toHaveCount(0);
    await admin.keyboard.press('Escape');

    const phoneForm = admin.getByTestId('support-whatsapp-form');
    await phoneForm.getByLabel(a.whatsappLabel).fill('12345');
    await phoneForm.getByRole('button', { name: a.save }).click();
    await expect(phoneForm.getByText(a.errors.invalidPhone)).toBeVisible();

    await phoneForm.getByLabel(a.whatsappLabel).fill(PHONE);
    await phoneForm.getByRole('button', { name: a.save }).click();
    await expect(phoneForm.getByText(a.saved)).toBeVisible();
    await expect(admin.getByText(a.whatsappCurrent(PHONE))).toBeVisible();

    const hoursForm = admin.getByTestId('support-hours-form');
    await hoursForm.getByLabel(a.hoursLabel).fill(`  ${HOURS} `);
    await hoursForm.getByRole('button', { name: a.save }).click();
    await expect(hoursForm.getByText(a.saved)).toBeVisible();
  });

  await test.step('Ana writes as Cliente, and from her trip with its folio', async () => {
    await page.goto('/cliente');
    const help = await openHelp(page);
    await expect(help).toBeVisible();
    await expect(help).toContainText(supportCopy.help);
    await expect(help).toContainText(supportCopy.hours(HOURS));
    await expect(help).toHaveAttribute('target', '_blank');
    const general = await messageOf(page);
    expect(general).toBe(supportCopy.message('Cliente', null));
    await page.keyboard.press('Escape');

    await page.goto(`/cliente/viajes/${ids.unloadingTrip}`);
    const folio = ids.unloadingTrip.slice(0, 8).toUpperCase();
    await expect(await openHelp(page)).toContainText(supportCopy.helpWithTrip(folio));
    expect(await messageOf(page)).toBe(supportCopy.message('Cliente', folio));
    await page.keyboard.press('Escape');
  });

  await test.step('the hombre camión writes as "Hombre camión"', async () => {
    const jose = await browser.newPage();
    await signInOnWeb(jose, 'jose');
    await jose.goto('/transportista');
    await expect(await openHelp(jose)).toBeVisible();
    expect(await messageOf(jose)).toContain('Soy Hombre camión.');
    await jose.close();
  });

  await test.step('the admin removes the number and "Ayuda" goes away', async () => {
    await admin.reload();
    await admin.getByTestId('support-hours-form').getByRole('button', { name: a.clear }).click();
    await expect(admin.getByTestId('support-hours-form').getByText(a.saved)).toBeVisible();
    await admin.getByTestId('support-whatsapp-form').getByRole('button', { name: a.clear }).click();
    await expect(admin.getByText(a.whatsappNone)).toBeVisible();
    await admin.close();

    await page.goto('/cliente');
    await expect(await openHelp(page)).toHaveCount(0);
  });
});
