import { expect, test } from '@playwright/test';
import { carrierLoadsCopy, dwellCopy, roadsCopy } from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Waiting times at the sites (H5, D32). The seed has older MTY -> GDL trips of
// Aceros del Norte with Transportes Regios (supabase/seed.sql, loads 16-19):
// its Guadalajara delivery measures ~5 h in 5 trips and its Monterrey pickup
// ~3 h in 6. Andrea sees the typical unloading time on the return trip of
// CS53-01 (unloading at that delivery) and the typical loading time on the
// flatbed load from that pickup; Ana sees the times of her own sites and the
// estimated end of unloading of her trip. Only reads, and before
// return-trip.spec.ts (files run in alphabetical order): that one finishes the
// unloading of CS53-01, which then has no return trip from Guadalajara.

const RETURN_ROUTE = 'Guadalajara → Monterrey';

test('the measured waiting times reach the return trips, the loads and the shipper', async ({
  browser,
}) => {
  const andreaContext = await browser.newContext();
  const andrea = await andreaContext.newPage();

  await test.step('the return trip of CS53-01 says how long unloading usually takes there', async () => {
    await signInOnWeb(andrea, 'andrea');
    await expect(
      andrea.getByRole('heading', { name: carrierLoadsCopy.home.returnTrips }),
    ).toBeVisible();
    const card = andrea.getByRole('listitem').filter({ hasText: RETURN_ROUTE }).first();
    await expect(card.getByText('Espera típica en descarga: ~5 h (5 viajes)')).toBeVisible();
  });

  await test.step('the suggested road of a load says how long loading usually takes at its pickup', async () => {
    await andrea.goto(`/transportista/cargas/${ids.flatbedLoad}`);
    await expect(andrea.getByRole('heading', { name: roadsCopy.section })).toBeVisible();
    await expect(andrea.getByText(/^Espera típica al cargar: ~3 h \(\d+ viajes\)$/u)).toBeVisible();
  });

  await test.step('the carrier sees the estimated end of unloading of its trip', async () => {
    await andrea.goto(`/transportista/viajes/${ids.unloadingTrip}`);
    await expect(andrea.getByText(dwellCopy.tripEnd)).toBeVisible();
    await expect(andrea.getByText('Estimado del operador')).toBeVisible();
  });
  await andreaContext.close();

  const anaContext = await browser.newContext();
  const ana = await anaContext.newPage();
  await test.step('Ana sees the typical time at her own sites on her trip', async () => {
    await signInOnWeb(ana, 'ana');
    await ana.goto(`/cliente/viajes/${ids.unloadingTrip}`);
    const sites = ana
      .locator('section')
      .filter({ has: ana.getByRole('heading', { name: dwellCopy.siteTitle }) });
    await expect(sites.getByText(dwellCopy.sitePickup, { exact: true })).toBeVisible();
    await expect(sites.getByText('~3 h (6 viajes)')).toBeVisible();
    await expect(sites.getByText('~5 h (5 viajes)')).toBeVisible();
    await expect(ana.getByText(dwellCopy.tripEnd)).toBeVisible();
  });
  await anaContext.close();
});
