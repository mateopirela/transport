import { expect, test, type Page } from '@playwright/test';
import {
  carrierTripsCopy,
  carrierWebCopy,
  clientTripsCopy,
  fleetCopy,
  tripDocumentKindLabels,
  tripStatusLabels,
} from '@transport/shared';

import { acceptOffer, findTrip, makeOffer, pendingCarrierOffer, signInAs } from '../support/actors';
import { ids } from '../support/demo';
import { SAMPLE_PDF, signInOnWeb } from '../support/web';

// Carrier web (G10b): the León → Apodaca load is contracted with the offer of
// the "Corredor MTY–GDL" business unit (carrier-web-offer.spec.ts leaves it
// pending; alone, Andrea offers here through the same RPC). Andrea, its
// Coordinadora, assigns CS53-01 and Pedro López on the web and uploads the
// Carta Porte; her fleet shows only her business unit; Héctor, Coordinador
// of "Regional Monterrey", cannot open that trip; Jorge, the Gerente,
// registers a unit in "Regional Monterrey" that only Héctor sees and then
// archives it; finally Andrea cancels the trip, so CS53-01 is free again for
// return-trip.spec.ts. Demo data: supabase/seed.sql (docs/demo-local.md).

const LEON_ROUTE = 'León, Guanajuato → Apodaca, Nuevo León';
const LEON_HEADING = 'León → Apodaca';
const TEST_PLATE = 'PRB1234';
const CANCEL_REASON = 'El cliente pospuso la carga.';
const c = carrierWebCopy.trips;
const f = carrierWebCopy.fleet;

/** Picks the option of a select whose text mentions `text`. */
async function selectByText(select: ReturnType<Page['getByLabel']>, text: string) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  if (!value) throw new Error(`No option mentions ${text}`);
  await select.selectOption(value);
}

test('the carrier staff assign, document and cancel trips and run the fleet on the web', async ({
  browser,
}) => {
  const sofia = await signInAs('sofia');

  const tripId =
    await test.step('the León → Apodaca load is contracted with the corridor offer', async () => {
      let offerId = await pendingCarrierOffer(sofia, ids.leonLoad);
      if (!offerId) {
        const andrea = await signInAs('andrea');
        offerId = await makeOffer(andrea, {
          loadId: ids.leonLoad,
          amountCents: 3_200_000,
          vehicleId: ids.dryVan,
        });
      }
      await acceptOffer(sofia, offerId);
      const trip = await findTrip(sofia, { loadId: ids.leonLoad });
      expect(trip.status).toBe('pending_assignment');
      return trip.id;
    });

  const andreaContext = await browser.newContext();
  const andrea = await andreaContext.newPage();
  await signInOnWeb(andrea, 'andrea');

  await test.step('Andrea finds the trip to assign and assigns CS53-01 with Pedro', async () => {
    await andrea.goto('/transportista/viajes');
    await expect(andrea.getByRole('heading', { name: c.title })).toBeVisible();
    await andrea
      .getByRole('row')
      .filter({ hasText: LEON_ROUTE })
      .getByRole('link', { name: c.open })
      .click();
    await expect(andrea).toHaveURL(new RegExp(`/transportista/viajes/${tripId}`, 'u'));
    await expect(andrea.getByRole('heading', { name: LEON_HEADING })).toBeVisible();
    await expect(andrea.getByText(tripStatusLabels.pending_assignment).first()).toBeVisible();

    await selectByText(andrea.getByLabel(c.assign.unit), 'CS53-01');
    await selectByText(andrea.getByLabel(c.assign.operator), 'Pedro López');
    await andrea.getByRole('button', { name: c.assign.submit }).click();
    await andrea.getByRole('button', { name: c.assign.confirm }).click();
    await expect(andrea.getByText(c.assign.done)).toBeVisible();
    await expect(andrea.getByText(tripStatusLabels.assigned).first()).toBeVisible();
    await expect(
      andrea.getByText(carrierTripsCopy.assign.current('CS53-01', 'Pedro López')),
    ).toBeVisible();
  });

  await test.step('Andrea uploads the Carta Porte and the checklist ticks it', async () => {
    const upload = clientTripsCopy.documents.upload;
    const form = andrea
      .locator('form')
      .filter({ has: andrea.getByRole('button', { name: upload.submit }) });
    await form.getByLabel(upload.kind).selectOption('carta_porte');
    await form.getByLabel(upload.file).setInputFiles(SAMPLE_PDF);
    await form.getByRole('button', { name: upload.submit }).click();
    await expect(andrea.getByText(c.documents.done)).toBeVisible();
    await expect(
      andrea.getByRole('link', {
        name: `${tripDocumentKindLabels.carta_porte} · ${SAMPLE_PDF.name}`,
      }),
    ).toBeVisible();
  });

  await test.step('Andrea sees only the fleet of her business unit, without the add buttons', async () => {
    await andrea.goto('/transportista/flota/unidades');
    await expect(andrea.getByText('CS53-01').first()).toBeVisible();
    await expect(andrea.getByText('TRN-01').first()).toBeVisible();
    await expect(andrea.getByText('RF53-01')).toHaveCount(0);
    await expect(andrea.getByRole('link', { name: f.units.add })).toHaveCount(0);
    await andrea.goto('/transportista/flota/operadores');
    await expect(andrea.getByText('Pedro López').first()).toBeVisible();
    await expect(andrea.getByText('Raúl Méndez')).toHaveCount(0);
    await expect(andrea.getByRole('link', { name: f.operators.add })).toHaveCount(0);
  });

  const hectorContext = await browser.newContext();
  const hector = await hectorContext.newPage();
  await signInOnWeb(hector, 'hector');

  await test.step('Héctor cannot open the corridor trip nor see it in his list', async () => {
    await hector.goto(`/transportista/viajes/${tripId}`);
    await expect(hector.getByText(c.errors.notFound)).toBeVisible();
    await hector.goto('/transportista/viajes');
    await expect(hector.getByRole('heading', { name: c.title })).toBeVisible();
    await expect(hector.getByRole('row').filter({ hasText: LEON_ROUTE })).toHaveCount(0);
  });

  const jorgeContext = await browser.newContext();
  const jorge = await jorgeContext.newPage();
  await signInOnWeb(jorge, 'jorge');

  const unitUrl = await test.step('Jorge registers a unit in "Regional Monterrey"', async () => {
    await jorge.goto('/transportista/flota/unidades');
    await jorge.getByRole('link', { name: f.units.add }).click();
    const form = jorge
      .locator('form')
      .filter({ has: jorge.getByRole('button', { name: fleetCopy.units.save }) });
    await form.getByLabel(fleetCopy.units.kindLabel).selectOption('rigid');
    await form.getByLabel(f.businessUnitField).selectOption({ label: 'Regional Monterrey' });
    await form.getByLabel(fleetCopy.units.plateLabel).fill(TEST_PLATE);
    await form.getByLabel(fleetCopy.units.unitTypeLabel).selectOption('torton');
    await form.getByLabel(fleetCopy.units.capacityKgLabel).fill('12000');
    await form.getByRole('button', { name: fleetCopy.units.save }).click();
    await expect(jorge).toHaveURL(/\/transportista\/flota\/unidades\/[0-9a-f-]{36}/u);
    await expect(jorge.getByText(f.units.created)).toBeVisible();
    return jorge.url();
  });

  await test.step('Jorge edits the unit and the form keeps the saved values', async () => {
    const form = jorge
      .locator('form')
      .filter({ has: jorge.getByRole('button', { name: fleetCopy.units.save }) });
    await form.getByLabel(fleetCopy.units.fleetNumberLabel).fill('PRB-01');
    await form.getByRole('button', { name: fleetCopy.units.save }).click();
    await expect(jorge.getByText(f.units.saved)).toBeVisible();
    await expect(form.getByLabel(fleetCopy.units.plateLabel)).toHaveValue(TEST_PLATE);
    await expect(form.getByLabel(fleetCopy.units.fleetNumberLabel)).toHaveValue('PRB-01');
  });

  await test.step('only Héctor sees the new unit', async () => {
    await hector.goto('/transportista/flota/unidades');
    await expect(hector.getByText(TEST_PLATE).first()).toBeVisible();
    await andrea.goto('/transportista/flota/unidades');
    await expect(andrea.getByText(TEST_PLATE)).toHaveCount(0);
  });

  await test.step('Jorge archives the unit', async () => {
    await jorge.goto(unitUrl);
    await jorge.getByText(f.archive.unit, { exact: true }).click();
    await jorge.getByRole('button', { name: f.archive.confirm }).click();
    await expect(jorge).toHaveURL(/\/transportista\/flota\/unidades\?/u);
    await expect(jorge.getByText(f.units.archived)).toBeVisible();
    await expect(jorge.getByText(TEST_PLATE)).toHaveCount(0);
  });

  await test.step('Andrea cancels the trip with a reason', async () => {
    await andrea.goto(`/transportista/viajes/${tripId}`);
    await andrea.getByText(c.cancel.open, { exact: true }).click();
    await andrea.getByLabel(c.cancel.reason).fill(CANCEL_REASON);
    await andrea.getByRole('button', { name: c.cancel.confirm }).click();
    // The page revalidates at once: the form gives way to the cancelled notice.
    await expect(andrea.getByText(carrierTripsCopy.detail.cancelled(CANCEL_REASON))).toBeVisible();
    await expect(andrea.getByText(tripStatusLabels.cancelled).first()).toBeVisible();
    expect((await findTrip(sofia, { tripId })).status).toBe('cancelled');
  });

  await Promise.all([andreaContext.close(), hectorContext.close(), jorgeContext.close()]);
});
