import { expect, test } from '@playwright/test';
import { clientTripsCopy, offersCopy, tripStatusLabels } from '@transport/shared';

import {
  addEvidencePhoto,
  assignTrip,
  findTrip,
  makeOffer,
  minimumPhotos,
  recommendationsFor,
  recordTripEvent,
  signInAs,
} from '../support/actors';
import { ids, places } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Star scenario of the pilot (B26): the unit of a MTY → GDL trip that is still
// unloading in Guadalajara gets the GDL → MTY load as its first
// recommendation, and that return trip is contracted before the unloading
// ends. Demo data: supabase/seed.sql (docs/demo-local.md).

const actions = offersCopy.actions;

test('the GDL → MTY return trip is contracted before the unloading in Guadalajara ends', async ({
  page,
}) => {
  const jorge = await signInAs('jorge');

  await test.step('the MTY → GDL trip is unloading, with an estimated end', async () => {
    const trip = await findTrip(jorge, { tripId: ids.unloadingTrip });
    expect(trip.status).toBe('unloading');
    expect(trip.estimated_unload_end_at).not.toBeNull();
    expect(Date.parse(trip.estimated_unload_end_at ?? '')).toBeGreaterThan(Date.now());
  });

  await test.step('the return load is the first recommendation of the unit', async () => {
    const { source, recommendations } = await recommendationsFor(jorge, ids.dryVan);
    test.info().annotations.push({ type: 'recommendations', description: source });
    const [first] = recommendations;
    expect(first?.loadId).toBe(ids.returnLoad);
    expect(first?.origin.city).toBe('Guadalajara');
    expect(first?.destination.city).toBe('Monterrey');
    // The carrier accepts the proposed price with the unit that is unloading.
    await makeOffer(jorge, {
      loadId: ids.returnLoad,
      amountCents: first?.proposedPriceCents ?? 0,
      vehicleId: ids.dryVan,
    });
  });

  await test.step('the shipper accepts the offer on the web', async () => {
    await signInOnWeb(page, 'luis');
    await page.goto(`/cliente/cargas/${ids.returnLoad}`);
    await page.getByRole('link', { name: offersCopy.board.open }).click();
    await page.getByText(actions.accept, { exact: true }).click();
    await page.getByRole('button', { name: actions.acceptConfirm }).click();
    await expect(page.getByText(actions.accepted)).toBeVisible();
  });

  await test.step('the return trip exists while the first trip is still unloading', async () => {
    const unloading = await findTrip(jorge, { tripId: ids.unloadingTrip });
    const returnTrip = await findTrip(jorge, { loadId: ids.returnLoad });
    expect(unloading.status).toBe('unloading');
    expect(unloading.delivered_at).toBeNull();
    expect(returnTrip.status).toBe('pending_assignment');
    expect(Date.parse(returnTrip.created_at)).toBeLessThan(
      Date.parse(unloading.estimated_unload_end_at ?? ''),
    );

    await page.goto(`/cliente/cargas/${ids.returnLoad}`);
    await page.getByRole('link', { name: clientTripsCopy.loadLink }).click();
    await expect(page.getByRole('heading', { name: 'Guadalajara → Monterrey' })).toBeVisible();
    await expect(page.getByText(tripStatusLabels.pending_assignment).first()).toBeVisible();
  });

  await test.step('the operator finishes unloading and takes the return trip', async () => {
    const pedro = await signInAs('pedro');
    const photos = await minimumPhotos(pedro, 'delivery');
    for (let i = 0; i < photos; i += 1) {
      await addEvidencePhoto(pedro, {
        tripId: ids.unloadingTrip,
        stage: 'delivery',
        at: places.guadalajaraDelivery,
      });
    }
    await recordTripEvent(pedro, {
      tripId: ids.unloadingTrip,
      event: 'unloading_finished',
      at: places.guadalajaraDelivery,
      receivedBy: 'Martha Ruiz (almacén)',
    });
    expect((await findTrip(jorge, { tripId: ids.unloadingTrip })).status).toBe('delivered');

    const returnTrip = await findTrip(jorge, { loadId: ids.returnLoad });
    await assignTrip(jorge, {
      tripId: returnTrip.id,
      vehicleId: ids.dryVan,
      operatorId: ids.pedroOperator,
    });
    expect((await findTrip(pedro, { tripId: returnTrip.id })).status).toBe('assigned');
  });
});
