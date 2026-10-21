import { expect, test, type Page } from '@playwright/test';
import { fleetCopy, roadPreferenceLabels, roadsCopy } from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Road intelligence (H4, D31). The pilot corridor MTY ↔ GDL comes from the
// migration (also in production): the main way by Saltillo and San Luis
// Potosí and an alternative by Zacatecas and Aguascalientes, with the CAPUFE
// tariffs of Los Chorros and Lagos de Moreno ($306 + $442 for a 5-axle truck)
// and the other tariffs "Sin dato". Andrea sees the suggested road of the
// flatbed load MTY → Tlaquepaque, the admin corrects a tariff and Andrea sees
// it, then she avoids Saltillo – Matehuala on her MTY → GDL route and the road
// switches to the alternative. The preference is cleared at the end.

const MAIN = 'MTY–GDL por Saltillo y San Luis Potosí';
const ALTERNATIVE = 'MTY–GDL por Zacatecas y Aguascalientes';
const AVOIDED = 'Saltillo – Matehuala · 57';
const f = roadsCopy.admin.form;

async function openLoad(page: Page) {
  await page.goto(`/transportista/cargas/${ids.flatbedLoad}`);
  await expect(page.getByRole('heading', { name: roadsCopy.section })).toBeVisible();
}

test('the suggested road shows the catalog tolls, follows the admin and the avoided segments', async ({
  page,
  browser,
}) => {
  await test.step('Andrea sees the suggested road and its estimated tolls', async () => {
    await signInOnWeb(page, 'andrea');
    await openLoad(page);
    await expect(page.getByText(MAIN, { exact: true })).toBeVisible();
    await expect(page.getByText(`${roadsCopy.tolls}: desde $748.00`)).toBeVisible();
    await expect(page.getByText(roadsCopy.tollsMissing)).toBeVisible();
    await expect(page.getByText(/estimado · CAPUFE/u).first()).toBeVisible();
  });

  await test.step('the admin records the 5-axle tariff of Lagos de Moreno – Zapotlanejo', async () => {
    const admin = await browser.newPage();
    await signInOnWeb(admin, 'admin');
    await admin.goto('/admin/carreteras');
    const segment = admin
      .getByRole('listitem')
      .filter({ has: admin.getByRole('heading', { name: 'Lagos de Moreno – Zapotlanejo' }) });
    const toll = segment.locator('details').filter({ hasText: f.editToll });
    await toll.getByText(f.editToll).click();
    await toll.getByLabel(f.tollAmount).fill('700');
    await toll.getByLabel(f.source, { exact: true }).fill('Prueba E2E');
    await toll.getByRole('button', { name: f.setToll }).click();
    await expect(toll.getByText(f.saved)).toBeVisible();
    await admin.close();
  });

  await test.step('Andrea sees the corrected total', async () => {
    await openLoad(page);
    await expect(page.getByText(`${roadsCopy.tolls}: desde $1,448.00`)).toBeVisible();
  });

  const route = page.getByRole('region', {
    name: fleetCopy.routes.item('Monterrey', 'Guadalajara'),
  });

  await test.step('she avoids Saltillo – Matehuala and the road takes the alternative', async () => {
    await page.goto('/transportista/rutas');
    await route.getByLabel(roadsCopy.preferences.segmentLabel).selectOption({ label: AVOIDED });
    await route
      .getByLabel(roadsCopy.preferences.kindLabel)
      .selectOption({ label: roadPreferenceLabels.avoid });
    await route.getByRole('button', { name: roadsCopy.preferences.save }).click();
    await expect(route.getByText(roadsCopy.preferences.saved)).toBeVisible();
    await expect(route.getByText(AVOIDED)).toBeVisible();

    await openLoad(page);
    await expect(page.getByText(ALTERNATIVE, { exact: true })).toBeVisible();
  });

  await test.step('clearing the preference brings the main road back', async () => {
    await page.goto('/transportista/rutas');
    await route
      .getByRole('button', { name: `${roadsCopy.preferences.remove}: Saltillo – Matehuala` })
      .click();
    await expect(route.getByRole('button', { name: roadsCopy.preferences.save })).toBeVisible();
    await openLoad(page);
    await expect(page.getByText(MAIN, { exact: true })).toBeVisible();
  });
});
