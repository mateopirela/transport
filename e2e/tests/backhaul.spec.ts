import { expect, test } from '@playwright/test';
import { backhaulCopy, notificationsInboxCopy } from '@transport/shared';

import {
  acceptOffer,
  addEvidencePhoto,
  assignTrip,
  makeOffer,
  minimumPhotos,
  publishLoad,
  recordTripEvent,
  signInAs,
} from '../support/actors';
import { ids, places } from '../support/demo';
import { signInOnWeb } from '../support/web';

// I7 · Carga de regreso (D40), the acceptance of the block: Héctor
// ("Regional Monterrey") wins a MTY → GDL refrigerated load of Ana with
// RF53-01 and Raúl Méndez. When Raúl records the arrival at the delivery in
// Guadalajara, Héctor and Jorge get "Carga de regreso" with the seed's
// refrigerated GDL → MTY load (Tlaquepaque → San Nicolás, ids.reeferLoad);
// Andrea (another business unit) and Raúl do not. Héctor opens it on the web
// and lands on "Para el regreso" of the trip. The trip is then finished, so
// RF53-01 is free again for the later specs (shipper-journey.spec.ts).

const RETURN_ROUTE = 'Tlaquepaque → San Nicolás de los Garza';
const NOTICE = /\d+ cargas? cerca de Guadalajara para cuando la unidad RF53-01 quede libre\./u;

test('the arrival at the delivery suggests the return loads to the staff of the unit', async ({
  page,
}) => {
  const ana = await signInAs('ana');
  const hectorApi = await signInAs('hector');
  const raul = await signInAs('raul');
  const loadId = await publishLoad(ana, { unitType: 'refrigerated', weightKg: 15_000 });
  const offerId = await makeOffer(hectorApi, {
    loadId,
    amountCents: 3_800_000,
    vehicleId: ids.reefer,
  });
  await acceptOffer(ana, offerId);
  const { data: trip, error } = await hectorApi
    .from('trips')
    .select('id')
    .eq('load_id', loadId)
    .single();
  if (error) throw new Error(error.message);
  const tripId = trip.id;
  await assignTrip(hectorApi, { tripId, vehicleId: ids.reefer, operatorId: ids.raulOperator });

  await test.step('Raúl loads in Monterrey: nothing is suggested before the destination', async () => {
    await recordTripEvent(raul, { tripId, event: 'departed', at: places.monterrey });
    await recordTripEvent(raul, { tripId, event: 'arrived_at_pickup', at: places.monterrey });
    await recordTripEvent(raul, { tripId, event: 'loading_started', at: places.monterrey });
    const photos = await minimumPhotos(raul, 'pickup');
    for (let i = 0; i < photos; i += 1) {
      await addEvidencePhoto(raul, { tripId, stage: 'pickup', at: places.monterrey });
    }
    await recordTripEvent(raul, { tripId, event: 'loading_finished', at: places.monterrey });
    const { data: checks } = await hectorApi
      .from('trip_backhaul_checks')
      .select('trip_id')
      .eq('trip_id', tripId);
    expect(checks).toEqual([]);
  });

  await test.step('the arrival in Guadalajara notifies Héctor and Jorge, once', async () => {
    await recordTripEvent(raul, {
      tripId,
      event: 'arrived_at_delivery',
      at: places.guadalajaraDelivery,
    });
    const notices = async (user: 'hector' | 'jorge' | 'andrea' | 'raul') => {
      const client = user === 'hector' ? hectorApi : user === 'raul' ? raul : await signInAs(user);
      const { data, error: readError } = await client
        .from('notifications')
        .select('data')
        .eq('type', 'backhaul_suggestions')
        .eq('data->>tripId', tripId);
      if (readError) throw new Error(readError.message);
      return data;
    };
    const [hector] = await notices('hector');
    expect(hector?.data).toMatchObject({ tripId, vehicleId: ids.reefer, city: 'Guadalajara' });
    expect(await notices('jorge')).toHaveLength(1);
    expect(await notices('andrea')).toHaveLength(0);
    expect(await notices('raul')).toHaveLength(0);
  });

  await test.step('Héctor opens it on the web and sees the return load in "Para el regreso"', async () => {
    await signInOnWeb(page, 'hector');
    await page.goto('/transportista/notificaciones');
    const notice = page.getByRole('listitem').filter({ hasText: NOTICE }).first();
    await expect(notice.getByText(backhaulCopy.notificationTitle)).toBeVisible();
    await notice.getByRole('button', { name: notificationsInboxCopy.open }).click();
    // The trip page asks for the unit's recommendations before it renders.
    await expect(page).toHaveURL(new RegExp(`/transportista/viajes/${tripId}#regreso$`, 'u'), {
      timeout: 60_000,
    });
    await expect(page.getByRole('heading', { name: backhaulCopy.section })).toBeVisible();
    const section = page.locator('section#regreso');
    await expect(section.getByText(/^Cargas compatibles cerca de Guadalajara/u)).toBeVisible();
    await expect(section.getByRole('listitem').filter({ hasText: RETURN_ROUTE })).toBeVisible();
  });

  await test.step('Raúl finishes the unloading: RF53-01 is free again', async () => {
    const started = await raul.rpc('record_trip_event', {
      p_trip_id: tripId,
      p_event_type: 'unloading_started',
      p_occurred_at: new Date().toISOString(),
      p_latitude: places.guadalajaraDelivery.lat,
      p_longitude: places.guadalajaraDelivery.lng,
      p_estimated_unload_end_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_client_event_id: crypto.randomUUID(),
    });
    if (started.error) throw new Error(started.error.message);
    const photos = await minimumPhotos(raul, 'delivery');
    for (let i = 0; i < photos; i += 1) {
      await addEvidencePhoto(raul, { tripId, stage: 'delivery', at: places.guadalajaraDelivery });
    }
    await recordTripEvent(raul, {
      tripId,
      event: 'unloading_finished',
      at: places.guadalajaraDelivery,
      receivedBy: 'Recepción E2E',
    });
  });
});
