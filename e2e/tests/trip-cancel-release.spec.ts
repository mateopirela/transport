import { expect, test } from '@playwright/test';
import {
  clientTripsCopy,
  tripCancelCopy,
  tripCancellationReasonLabels,
  tripStatusLabels,
  validationMessages,
  vehicleReadinessLabels,
  vehicleReleaseCopy,
} from '@transport/shared';

import { findTrip, publishLoad, recordTripEvent, signInAs } from '../support/actors';
import { ids, places } from '../support/demo';
import { signInOnWeb } from '../support/web';

// G5 (D20), the acceptance of the block on the seed: the assigned Apodaca →
// GDL trip of Fletes Tapatíos sets off (Miguel, RB-01), Sofía (the shipper)
// cancels it on the web with a reason, the unit shows "Pendiente de liberar",
// Carmen (the Gerente) releases it in Apodaca on the web and gets
// recommendations from there. Demo data: supabase/seed.sql.

const NOTES = 'Se pospuso la producción.';
const r = vehicleReleaseCopy;

test('a trip cancelled on its way leaves the unit pending until the carrier releases it', async ({
  browser,
}) => {
  await test.step('Miguel sets off with RB-01', async () => {
    const miguel = await signInAs('miguel');
    await recordTripEvent(miguel, {
      tripId: ids.assignedTrip,
      event: 'departed',
      at: places.apodaca,
    });
    const sofia = await signInAs('sofia');
    expect((await findTrip(sofia, { tripId: ids.assignedTrip })).status).toBe('en_route_to_pickup');
  });

  const sofiaContext = await browser.newContext();
  const sofia = await sofiaContext.newPage();
  await signInOnWeb(sofia, 'sofia');

  await test.step('Sofía cancels the trip on the web with a reason', async () => {
    await sofia.goto(`/cliente/viajes/${ids.assignedTrip}`);
    await sofia.getByText(tripCancelCopy.open, { exact: true }).click();
    await expect(sofia.getByText(tripCancelCopy.onTheWay)).toBeVisible();
    // "Otro" needs notes: the form says so before calling the server.
    await sofia.getByLabel(tripCancelCopy.reason).selectOption('other');
    await sofia.getByRole('button', { name: tripCancelCopy.confirm }).click();
    await expect(sofia.getByText(validationMessages.reasonRequired)).toBeVisible();
    await sofia.getByLabel(tripCancelCopy.reason).selectOption('shipper_request');
    await sofia.getByLabel(tripCancelCopy.notes).fill(NOTES);
    await sofia.getByRole('button', { name: tripCancelCopy.confirm }).click();
    await expect(
      sofia.getByText(
        clientTripsCopy.detail.cancelled(
          `${tripCancellationReasonLabels.shipper_request}. ${NOTES}`,
        ),
      ),
    ).toBeVisible();
    await expect(sofia.getByText(tripStatusLabels.cancelled).first()).toBeVisible();
  });

  // A rabón load near Apodaca, so the released unit has something to recommend.
  const loadId = await publishLoad(await signInAs('sofia'), { unitType: 'rabon', weightKg: 6000 });

  const carmenContext = await browser.newContext();
  const carmen = await carmenContext.newPage();
  await signInOnWeb(carmen, 'carmen');

  await test.step('Carmen sees the unit pending release on her home and fleet', async () => {
    await carmen.goto('/transportista');
    await expect(carmen.getByRole('heading', { name: r.home.title(1) })).toBeVisible();
    await carmen.goto('/transportista/flota/unidades');
    await expect(
      carmen
        .getByRole('row')
        .filter({ hasText: 'RB-01' })
        .getByText(vehicleReadinessLabels.pending_release),
    ).toBeVisible();
    await carmen.goto('/transportista');
    await carmen.getByRole('link', { name: r.home.open }).click();
    await expect(carmen).toHaveURL(new RegExp(`/transportista/flota/unidades/${ids.rabon}`, 'u'));
    await expect(carmen.getByRole('heading', { name: r.screen.title })).toBeVisible();
  });

  await test.step('Carmen releases RB-01 in Apodaca and gets recommendations from there', async () => {
    // The last known point is the departure in Apodaca.
    await expect(carmen.getByText(r.screen.near('Apodaca', 'Nuevo León'))).toBeVisible();
    await carmen.getByLabel(r.screen.notes).fill('Regresó al patio de Apodaca.');
    await carmen.getByRole('button', { name: r.screen.submit }).click();
    await expect(carmen.getByText(r.screen.done('Apodaca'))).toBeVisible();
    await expect(carmen.getByRole('heading', { name: r.screen.recommendations })).toBeVisible();
    await expect(
      carmen.locator(`a[href^="/transportista/cargas/${loadId}"]`).first(),
    ).toBeVisible();
    await expect(carmen.getByRole('heading', { name: r.screen.title })).toHaveCount(0);
  });

  await Promise.all([sofiaContext.close(), carmenContext.close()]);
});
