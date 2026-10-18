import { expect, test, type Page } from '@playwright/test';
import { authCopy, managerCompanyCopy } from '@transport/shared';

import { DEMO_PASSWORD, users } from '../support/demo';
import { signInOnWeb } from '../support/web';

// The Coordinador and the operators of their business units (G4): Héctor,
// coordinator of "Regional Monterrey", invites a new operator by link (he can
// only choose his business unit) and resets the access of Raúl Méndez. The
// newest reset link works and the previous one no longer does. Raúl keeps
// the demo password, so the later specs still sign in as him.

const m = managerCompanyCopy;
const inv = authCopy.invitation;
const f = authCopy.fields;

/** The link shown once after "Generar…", as a path of this web. */
async function issuedLink(page: Page): Promise<string> {
  const field = page.getByTestId('invitation-link');
  await expect(field).toHaveValue(/\/invitacion\//u);
  return new URL(await field.inputValue()).pathname;
}

test('a coordinator invites operators to his business unit and resets an access', async ({
  page,
  browser,
}) => {
  await signInOnWeb(page, 'hector');

  await test.step('invite a new operator: only his business unit is offered', async () => {
    await page.goto('/transportista/flota/operadores');
    await page.getByRole('link', { name: m.operators.invite }).click();
    const unit = page.getByLabel(m.operators.unitLabel);
    await expect(unit.locator('option', { hasText: 'Regional Monterrey' })).toHaveCount(1);
    await expect(unit.locator('option', { hasText: 'Corredor MTY–GDL' })).toHaveCount(0);
    await page.getByLabel(m.operators.inviteeLabel).fill('Operador Nuevo E2E');
    await page.getByRole('button', { name: m.operators.invite }).click();
    const link = await issuedLink(page);

    const visitor = await browser.newPage();
    await visitor.goto(link);
    await expect(visitor.getByText(/te invita como Operador/u)).toBeVisible();
    await expect(visitor.getByText('Regional Monterrey')).toBeVisible();
    await visitor.close();
  });

  let previous = '';
  let latest = '';
  await test.step('reset the access of Raúl Méndez twice', async () => {
    await page.goto('/transportista/flota/operadores');
    await page
      .getByRole('row', { name: /Raúl Méndez/u })
      .getByRole('link')
      .click();
    await page.getByRole('button', { name: m.operators.resetAccess }).click();
    previous = await issuedLink(page);
    await page.getByRole('button', { name: m.invitationLink.generate }).click();
    await expect(page.getByTestId('invitation-link')).not.toHaveValue(new RegExp(previous, 'u'));
    latest = await issuedLink(page);
  });

  await test.step('the previous link no longer works; the latest one does', async () => {
    const visitor = await browser.newPage();
    await visitor.goto(previous);
    await expect(visitor.getByText(inv.errors.invalid)).toBeVisible();

    await visitor.goto(latest);
    await expect(visitor.getByText(/restablecer tu acceso/u)).toBeVisible();
    await visitor.getByLabel(f.newPassword).fill(DEMO_PASSWORD);
    await visitor.getByLabel(f.passwordConfirmation).fill(DEMO_PASSWORD);
    await visitor.getByRole('button', { name: inv.reset.submit }).click();
    await expect(visitor.getByText(inv.reset.doneTitle)).toBeVisible();

    await visitor.goto(latest);
    await expect(visitor.getByText(inv.errors.invalid)).toBeVisible();
    await visitor.close();
  });

  await test.step('Raúl signs in with the password he chose (the web sends him to the app)', async () => {
    const raul = await browser.newPage();
    await signInOnWeb(raul, { email: users.raul, password: DEMO_PASSWORD });
    await expect(raul).toHaveURL(/\/solo-app/u);
    await raul.close();
  });
});
