import { expect, test } from '@playwright/test';
import { tripLinkCopy } from '@transport/shared';

import { acceptOffer, assignTrip, makeOffer, publishLoad, signInAs } from '../support/actors';
import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// H2 (D29), the acceptance of the block on the web: Andrea assigns Pedro a new
// trip of Ana and, from the trip screen, creates the trip link and sends it by
// WhatsApp to Pedro's phone (+52 81 1000 0008 in the seed). An anonymous
// visitor of /viaje/<token> only gets "Abrir en la app", never a detail of the
// trip. The trip is cancelled at the end, which revokes the link. Demo data:
// supabase/seed.sql.

const c = tripLinkCopy;
const PEDRO_WHATSAPP = '528110000008';

test('the coordinator sends the trip link by WhatsApp and the public page reveals nothing', async ({
  browser,
}) => {
  const ana = await signInAs('ana');
  const andreaApi = await signInAs('andrea');
  const loadId = await publishLoad(ana, { unitType: 'dry_van', weightKg: 12_000 });
  const offerId = await makeOffer(andreaApi, {
    loadId,
    amountCents: 2_400_000,
    vehicleId: ids.dryVan,
  });
  await acceptOffer(ana, offerId);
  const { data: trip, error } = await andreaApi
    .from('trips')
    .select('id')
    .eq('load_id', loadId)
    .single();
  if (error) throw new Error(error.message);
  await assignTrip(andreaApi, {
    tripId: trip.id,
    vehicleId: ids.dryVan,
    operatorId: ids.pedroOperator,
  });

  const andreaContext = await browser.newContext();
  const andrea = await andreaContext.newPage();
  let url = '';
  await test.step('Andrea creates the link and gets WhatsApp with Pedro’s phone', async () => {
    await signInOnWeb(andrea, 'andrea');
    await andrea.goto(`/transportista/viajes/${trip.id}`);
    await expect(andrea.getByRole('heading', { name: c.send.title })).toBeVisible();
    await andrea.getByRole('button', { name: c.send.create }).click();
    await expect(andrea.getByText(c.send.created)).toBeVisible();
    url = await andrea.getByLabel(c.send.link).inputValue();
    expect(url).toMatch(/\/viaje\/[A-Za-z0-9_-]{43}$/u);

    const whatsapp = andrea.getByRole('link', { name: c.send.whatsapp });
    const href = (await whatsapp.getAttribute('href')) ?? '';
    expect(href.startsWith(`https://wa.me/${PEDRO_WHATSAPP}?text=`)).toBe(true);
    const text = new URL(href).searchParams.get('text') ?? '';
    expect(text).toContain('Hola Pedro, tienes un viaje asignado: Monterrey → Guadalajara.');
    expect(text).toContain(url);
    const sms = (await andrea.getByRole('link', { name: c.send.sms }).getAttribute('href')) ?? '';
    expect(sms.startsWith(`sms:+${PEDRO_WHATSAPP}?body=`)).toBe(true);
  });

  const token = url.slice(url.lastIndexOf('/') + 1);
  await test.step('an anonymous visitor of /viaje/<token> only sees "Abrir en la app"', async () => {
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    const response = await visitor.goto(`/viaje/${token}`);
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
    await expect(visitor.getByRole('heading', { name: c.public.title })).toBeVisible();
    await expect(visitor.getByRole('link', { name: c.public.openInApp })).toHaveAttribute(
      'href',
      `transport://viaje/${token}`,
    );
    await expect(visitor.getByText(c.public.signIn)).toBeVisible();
    const body = (await visitor.locator('body').innerText()).toLowerCase();
    for (const secret of ['pedro', 'monterrey', 'guadalajara', 'tarimas', 'cs53']) {
      expect(body).not.toContain(secret);
    }
    await visitorContext.close();
  });

  await test.step('the link opens nothing for the shipper, and nothing once the trip is cancelled', async () => {
    const opened = await ana.rpc('open_trip_operator_link', { p_token: token });
    expect(opened.error?.code).toBe('22023');
    const pedro = await signInAs('pedro');
    const own = await pedro.rpc('open_trip_operator_link', { p_token: token });
    expect(own.data).toEqual({ tripId: trip.id, target: 'operator' });

    const cancelled = await andreaApi.rpc('cancel_trip', {
      p_trip_id: trip.id,
      p_reason_code: 'carrier_request',
      p_notes: 'Prueba E2E del enlace del viaje',
    });
    if (cancelled.error) throw new Error(cancelled.error.message);
    const after = await pedro.rpc('open_trip_operator_link', { p_token: token });
    expect(after.error?.code).toBe('22023');
  });

  await andreaContext.close();
});
