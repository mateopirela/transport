import { expect, test } from '@playwright/test';
import { managerCompanyCopy } from '@transport/shared';

import { signInOnWeb } from '../support/web';

// "Mi empresa" of the Gerente (G4): Jorge creates the business unit "Bajío",
// moves the unit TT-01 to it and gives it to Héctor, who then sees TT-01 in
// his fleet. A coordinator does not get "Mi empresa".

const m = managerCompanyCopy;
const run = Date.now().toString(36).slice(-4);
const bajio = `Bajío ${run}`;

test('the manager organizes business units, units and coordinators', async ({ page, browser }) => {
  await signInOnWeb(page, 'jorge');

  await test.step('create the business unit', async () => {
    await page.getByRole('link', { name: m.title }).click();
    await expect(page).toHaveURL(/\/transportista\/empresa/u);
    const create = page.locator('form', {
      has: page.getByRole('button', { name: m.businessUnits.create }),
    });
    await create.getByLabel(m.businessUnits.nameLabel).fill(bajio);
    await create.getByRole('button', { name: m.businessUnits.create }).click();
    await expect(page.getByText(m.businessUnits.created)).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(bajio, 'u') })).toBeVisible();
  });

  await test.step('move TT-01 to it', async () => {
    const unit = page.getByRole('listitem').filter({ hasText: 'TT-01' });
    await unit.getByLabel(m.fleet.move).selectOption({ label: bajio });
    await unit.getByRole('button', { name: m.fleet.moveSubmit }).click();
    await expect(page.getByText(m.fleet.moved)).toBeVisible();
  });

  const hector = await browser.newPage();
  await test.step('Héctor no longer sees TT-01', async () => {
    await signInOnWeb(hector, 'hector');
    await hector.goto('/transportista/flota/unidades');
    await expect(hector.getByText('RF53-01')).toBeVisible();
    await expect(hector.getByText('TT-01')).toHaveCount(0);
  });

  await test.step('give the new business unit to Héctor', async () => {
    const row = page.getByRole('row', { name: /Héctor Ibarra/u });
    await row.getByText(m.coordinators.editUnits).click();
    await row.getByLabel(bajio).check();
    await row.getByRole('button', { name: m.coordinators.saveUnits }).click();
    await expect(page.getByText(m.coordinators.unitsSaved)).toBeVisible();
  });

  await test.step('Héctor sees TT-01 again, now in the new business unit', async () => {
    await hector.reload();
    await expect(hector.getByText('TT-01')).toBeVisible();
    await expect(hector.getByRole('link', { name: m.title })).toHaveCount(0);
    await hector.goto('/transportista/empresa');
    await expect(hector.getByText(m.managerOnly)).toBeVisible();
    await hector.close();
  });
});
