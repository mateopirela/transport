import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import {
  carrierWebCopy,
  managerCompanyCopy,
  providerStateLabels,
  shareLinksCopy,
  sharedDocumentsCopy,
} from '@transport/shared';

import { signInAs } from '../support/actors';
import { carrierName, ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// One walk per profile on the demo seed (G9, plan §G): the Cliente, the
// Gerente, the Coordinador (and what another business unit hides from him),
// the hombre-camión on the web and an anonymous visitor. They only read (the
// anonymous walk creates and revokes its own link), so they can run after the
// specs of G2–G7. With E2E_SCREENSHOTS_DIR set, each step leaves a full-page
// screenshot there (the G9 screenshots of the PR).

const shotsDir = process.env.E2E_SCREENSHOTS_DIR?.trim();

async function shot(page: Page, name: string): Promise<void> {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
}

const nav = carrierWebCopy.nav;
const fleet = carrierWebCopy.fleet;

test('Cliente: her trip in unloading, the carrier documents and the provider status', async ({
  page,
}) => {
  await signInOnWeb(page, 'ana');
  await expect(page).toHaveURL(/\/cliente/u);
  await shot(page, 'web-cliente-1-inicio');

  await page.goto(`/cliente/viajes/${ids.unloadingTrip}`);
  await expect(page.getByText(carrierName).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: sharedDocumentsCopy.client.title })).toBeVisible();
  await expect(
    page
      .getByText(providerStateLabels.pending)
      .or(page.getByText(providerStateLabels.approved))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: shareLinksCopy.button })).toBeVisible();
  await shot(page, 'web-cliente-2-viaje');
});

test('Gerente: supervision per business unit, the whole fleet and Mi empresa', async ({ page }) => {
  await signInOnWeb(page, 'jorge');
  await expect(page).toHaveURL(/\/transportista/u);
  const supervision = managerCompanyCopy.supervision;
  await expect(page.getByRole('heading', { name: supervision.title })).toBeVisible();
  const units = page.getByRole('main').getByRole('listitem');
  await expect(units.filter({ hasText: 'Corredor MTY–GDL' })).toBeVisible();
  await expect(units.filter({ hasText: 'Regional Monterrey' })).toBeVisible();
  await shot(page, 'web-gerente-1-inicio');

  await page.getByRole('link', { name: nav.fleet, exact: true }).click();
  for (const unit of ['TRN-01', 'CS53-01', 'RF53-01']) {
    await expect(page.getByText(unit).first()).toBeVisible();
  }
  await expect(page.getByRole('link', { name: fleet.units.add })).toBeVisible();
  await shot(page, 'web-gerente-2-flota');

  await page.getByRole('link', { name: managerCompanyCopy.title }).click();
  await expect(page).toHaveURL(/\/transportista\/empresa/u);
  await expect(page.getByText('Andrea Cavazos').first()).toBeVisible();
  await expect(page.getByText('Héctor Ibarra').first()).toBeVisible();
  await shot(page, 'web-gerente-3-mi-empresa');
});

test('Coordinador: only the units, operators and trips of her business unit', async ({
  page,
  browser,
}) => {
  await signInOnWeb(page, 'andrea');
  await expect(
    page.getByRole('heading', { name: managerCompanyCopy.supervision.title }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: managerCompanyCopy.title })).toHaveCount(0);
  await shot(page, 'web-coordinadora-1-inicio');

  await page.getByRole('link', { name: nav.fleet, exact: true }).click();
  await expect(page.getByText('CS53-01').first()).toBeVisible();
  await expect(page.getByText('RF53-01')).toHaveCount(0);
  await expect(page.getByText(fleet.managerOnly)).toBeVisible();
  await expect(page.getByRole('link', { name: fleet.units.add })).toHaveCount(0);
  await shot(page, 'web-coordinadora-2-flota');

  await page.goto('/transportista/flota/operadores');
  await expect(page.getByText('Pedro López').first()).toBeVisible();
  await expect(page.getByText('Raúl Méndez')).toHaveCount(0);
  await expect(page.getByText('Iván Garza')).toHaveCount(0);

  // The trip in unloading is the corridor's: Andrea opens it, Héctor cannot.
  await page.goto(`/transportista/viajes/${ids.unloadingTrip}`);
  await expect(page.getByText('CS53-01').first()).toBeVisible();
  await shot(page, 'web-coordinadora-3-viaje');

  const hector = await browser.newPage();
  await signInOnWeb(hector, 'hector');
  await hector.goto('/transportista/flota/operadores');
  await expect(hector.getByText('Iván Garza').first()).toBeVisible();
  await expect(hector.getByText('Pedro López')).toHaveCount(0);
  await hector.goto(`/transportista/viajes/${ids.unloadingTrip}`);
  await expect(hector.getByText(carrierWebCopy.trips.errors.notFound)).toBeVisible();
  await shot(hector, 'web-coordinador-4-sin-acceso');
  await hector.close();
});

test('Hombre-camión: one company, one truck and himself as its operator', async ({ page }) => {
  await signInOnWeb(page, 'jose');
  await expect(page).toHaveURL(/\/transportista/u);
  await shot(page, 'web-hombre-camion-1-inicio');

  await page.getByRole('link', { name: nav.fleet, exact: true }).click();
  await expect(page.getByText('JSM-01').first()).toBeVisible();
  await expect(page.getByText('CS53-01')).toHaveCount(0);
  await shot(page, 'web-hombre-camion-2-flota');

  await page.goto('/transportista/flota/operadores');
  await expect(page.getByText('José Sánchez Medina').first()).toBeVisible();

  await page.getByRole('link', { name: nav.negotiations, exact: true }).click();
  await expect(page.getByRole('main')).toBeVisible();
  await shot(page, 'web-hombre-camion-3-negociaciones');
});

test('Anónimo: the sign-in wall, a public tracking link and a revoked one', async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/transportista');
  await expect(visitor).toHaveURL(/\/login/u);

  const ana = await signInAs('ana');
  const { data, error } = await ana.rpc('create_share_link', {
    p_kind: 'trip_tracking_public',
    p_trip_id: ids.unloadingTrip,
  });
  if (error) throw error;
  const link = Array.isArray(data) ? data[0] : data;
  if (!link) throw new Error('create_share_link returned nothing');

  await visitor.goto(`/compartido/${link.token}`);
  await expect(visitor.getByRole('heading', { name: 'Monterrey → Guadalajara' })).toBeVisible();
  await expect(visitor.getByText(carrierName).first()).toBeVisible();
  await expect(visitor.getByText('$')).toHaveCount(0);
  await shot(visitor, 'web-anonimo-1-seguimiento');

  const revoked = await ana.rpc('revoke_share_link', { p_id: link.id });
  if (revoked.error) throw revoked.error;
  await visitor.reload();
  await expect(visitor.getByText(shareLinksCopy.public.unavailableTitle).first()).toBeVisible();
  await shot(visitor, 'web-anonimo-2-revocado');
  await visitor.context().close();
});
