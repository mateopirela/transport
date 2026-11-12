import { expect, test } from '@playwright/test';
import { adminPanelCopy, brokeredCopy, freightCopy, loadsCopy } from '@transport/shared';

import { makeOffer, signInAs } from '../support/actors';
import { hoursFromNow, toDateTimeLocal } from '../support/data';
import { ids } from '../support/demo';
import { confirmDialog, signInOnWeb } from '../support/web';

// Brokered loads (I6, D39). The client never sees the carriers' rate, the
// carrier never sees the client's price, and only the admin sees the margin.
//   1. Ana sends a load to Transport with a target price; the admin quotes
//      $12,000 to her and $10,800 to the carriers; Ana approves her price and
//      Jorge finds the load published by Transport at $10,800.
//   2. The seed's brokered load (Apodaca → Zapopan, $12,000 / $10,800): José,
//      the hombre-camión, offers the rate, the admin accepts it as Transport,
//      the ledger keeps $1,200 of margin for the admin, Ana sees $12,000 and
//      José $10,800.

const b = brokeredCopy;
const lf = loadsCopy.form;

test('the client sends a load to Transport, approves its price and the carriers see the rate', async ({
  page,
  browser,
}) => {
  const ana = page;
  await signInOnWeb(ana, 'ana');

  await test.step('a load dated 9999-12-31 is refused with the reason', async () => {
    // Year 10000 in UTC once read in Mexico City: no page could show it, and
    // the lists of Ana and of the admin failed with a 500 (fix of I6).
    await ana.goto('/cliente/cargas/nueva');
    const streets = ana.getByRole('textbox', { name: lf.street });
    await ana.locator('#field-origin').selectOption({ label: 'Monterrey, Nuevo León' });
    await streets.nth(0).fill('Av. Constitución 400, Centro');
    await ana.locator('#field-destination').selectOption({ label: 'Guadalajara, Jalisco' });
    await streets.nth(1).fill('Av. Vallarta 3000, Vallarta Poniente');
    await ana.getByLabel(lf.pickupStart).fill('9999-12-31T18:00');
    await ana.getByLabel(lf.pickupEnd).fill('9999-12-31T19:00');
    await ana.getByLabel(lf.deliveryStart).fill('9999-12-31T22:00');
    await ana.getByLabel(lf.deliveryEnd).fill('9999-12-31T23:00');
    await ana.getByLabel(lf.cargoType).selectOption('palletized');
    await ana.getByLabel(lf.description).fill('Perfiles de acero en tarimas');
    await ana.getByLabel(lf.weightKg).fill('12000');
    await ana.getByLabel(lf.unitType).selectOption('dry_van');
    await ana.getByLabel(b.shipper.toggle).check();
    await ana.getByRole('button', { name: b.shipper.submit }).click();
    await expect(ana.getByText(loadsCopy.errors.datesOutOfRange)).toBeVisible();
    await expect(ana).toHaveURL(/\/cliente\/cargas\/nueva$/u);
  });

  let loadId = '';
  await test.step('Ana sends an MTY → GDL load with a target of $11,500', async () => {
    await ana.goto('/cliente/cargas/nueva');
    const streets = ana.getByRole('textbox', { name: lf.street });
    await ana.locator('#field-origin').selectOption({ label: 'Monterrey, Nuevo León' });
    await streets.nth(0).fill('Av. Constitución 400, Centro');
    await ana.locator('#field-destination').selectOption({ label: 'Guadalajara, Jalisco' });
    await streets.nth(1).fill('Av. Vallarta 3000, Vallarta Poniente');
    await ana.getByLabel(lf.pickupStart).fill(toDateTimeLocal(hoursFromNow(30)));
    await ana.getByLabel(lf.pickupEnd).fill(toDateTimeLocal(hoursFromNow(36)));
    await ana.getByLabel(lf.deliveryStart).fill(toDateTimeLocal(hoursFromNow(48)));
    await ana.getByLabel(lf.deliveryEnd).fill(toDateTimeLocal(hoursFromNow(60)));
    await ana.getByLabel(lf.cargoType).selectOption('palletized');
    await ana.getByLabel(lf.description).fill('Perfiles de acero en tarimas');
    await ana.getByLabel(lf.weightKg).fill('12000');
    await ana.getByLabel(lf.unitType).selectOption('dry_van');
    await ana.getByLabel(b.shipper.toggle).check();
    await ana.getByLabel(b.shipper.targetPrice).fill('11500');
    await ana.getByRole('button', { name: b.shipper.submit }).click();
    await expect(ana).toHaveURL(/\/cliente\/cargas\/[0-9a-f-]{36}$/u);
    loadId = ana.url().split('/').at(-1) ?? '';
    await expect(ana.getByText(b.shipper.stage.requested).first()).toBeVisible();
    // The client's web writes whole pesos without `.00` (Fulmis, §1.5).
    await expect(ana.getByText('$11,500')).toBeVisible();
  });

  await test.step('the admin quotes $12,000 to Ana and $10,800 to the carriers', async () => {
    const admin = await browser.newPage();
    await signInOnWeb(admin, 'admin');
    await admin.goto('/admin/intermediadas');
    await expect(admin.getByText(b.admin.stage.toQuote).first()).toBeVisible();
    await admin.goto(`/admin/intermediadas/${loadId}`);
    const quote = admin.getByTestId('brokered-quote');
    await quote.getByLabel(b.admin.clientPrice).fill('13000');
    await quote.getByLabel(b.admin.carrierPrice).fill('14000');
    await quote.getByRole('button', { name: b.admin.quote }).click();
    await confirmDialog(admin, adminPanelCopy.confirm.quote.confirm);
    await expect(quote.getByText(b.errors.carrierOverClient)).toBeVisible();
    await quote.getByLabel(b.admin.clientPrice).fill('12000');
    await quote.getByLabel(b.admin.carrierPrice).fill('10800');
    await quote.getByRole('button', { name: b.admin.quote }).click();
    await confirmDialog(admin, adminPanelCopy.confirm.quote.confirm);
    await expect(admin.getByText(b.admin.saved)).toBeVisible();
    await admin.close();
  });

  await test.step('Ana sees only her price and approves it', async () => {
    await ana.reload();
    await expect(ana.getByText(b.shipper.stage.quoted).first()).toBeVisible();
    await expect(ana.getByText('$10,800')).toHaveCount(0);
    await ana.getByRole('button', { name: b.shipper.approve('$12,000') }).click();
    await expect(ana.getByText(b.shipper.stage.searching).first()).toBeVisible();
    await expect(ana.getByText('$10,800')).toHaveCount(0);
  });

  await test.step('Ana finds it in her loads list, newest first, with her price', async () => {
    // The list reads client_loads (an RPC) ordered by created_at: the column
    // has to be in the select or PostgREST fails with 42703 (fix of I6).
    for (const list of ['/cliente/cargas', '/cliente/cargas?estado=published']) {
      await ana.goto(list);
      await expect(ana.getByRole('heading', { name: loadsCopy.list.title })).toBeVisible();
      // The loads are a table (V3): the route is the row's link, the price its own cell.
      const row = ana
        .getByRole('row')
        .filter({ has: ana.locator(`a[href="/cliente/cargas/${loadId}"]`) });
      await expect(row).toContainText('$12,000');
      await expect(ana.getByText('$10,800')).toHaveCount(0);
    }
  });

  await test.step('Jorge sees the load published by Transport at $10,800', async () => {
    const jorge = await browser.newPage();
    await signInOnWeb(jorge, 'jorge');
    await jorge.goto(`/transportista/cargas/${loadId}`);
    await expect(jorge.getByTestId('brokered-badge').first()).toHaveText(b.badge);
    // The carrier web drops a whole `.00` (docs/plan-fulmis.md §1.5).
    await expect(jorge.getByText('$10,800').first()).toBeVisible();
    await expect(jorge.getByText('$12,000')).toHaveCount(0);
    await expect(jorge.getByText('$11,500')).toHaveCount(0);
    await jorge.close();
  });
});

test('a client without brokered loads opens his loads list', async ({ page }) => {
  await signInOnWeb(page, 'luis');
  await page.goto('/cliente/cargas');
  await expect(page.getByRole('heading', { name: loadsCopy.list.title })).toBeVisible();
  await expect(page.locator(`a[href="/cliente/cargas/${ids.returnLoad}"]`)).toBeVisible();
});

test('the carrier takes the brokered load at its rate and the margin stays with the admin', async ({
  page,
  browser,
}) => {
  const load = ids.brokeredLoad;
  const jose = await signInAs('jose');
  await makeOffer(jose, { loadId: load, amountCents: 1_080_000, vehicleId: ids.jsmUnit });

  const admin = page;
  await test.step('the admin accepts the offer in the name of Transport', async () => {
    await signInOnWeb(admin, 'admin');
    await admin.goto(`/admin/intermediadas/${load}`);
    await expect(admin.getByText(b.admin.offerFrom.carrier).first()).toBeVisible();
    await admin.getByRole('button', { name: b.admin.accept, exact: true }).click();
    await confirmDialog(admin, adminPanelCopy.confirm.acceptBrokeredOffer.confirm);
    await expect(admin.getByTestId('brokered-margin')).toHaveText('$1,200');
    await expect(admin.getByText(b.admin.stage.contracted).first()).toBeVisible();
  });

  const { data: trip, error } = await jose.from('trips').select('id').eq('load_id', load).single();
  if (error) throw new Error(error.message);

  await test.step('the ledger: $12,000 from Ana, $10,800 to José, $1,200 of margin', async () => {
    await admin.goto('/admin/flete');
    const row = admin.getByTestId(`freight-row-${trip.id}`);
    await expect(row).toContainText('$12,000');
    await expect(row).toContainText('$10,800');
    await expect(row.getByTestId('freight-margin')).toHaveText('$1,200');
  });

  await test.step('Ana sees her price only', async () => {
    const ana = await browser.newPage();
    await signInOnWeb(ana, 'ana');
    await ana.goto(`/cliente/cargas/${load}`);
    await expect(ana.getByText('$12,000').first()).toBeVisible();
    await expect(ana.getByText('$10,800')).toHaveCount(0);
    await ana.goto(`/cliente/viajes/${trip.id}`);
    await expect(ana.getByText('$12,000').first()).toBeVisible();
    await expect(ana.getByText('$10,800')).toHaveCount(0);
    await ana.goto('/cliente/cartera');
    await expect(ana.getByTestId(`portfolio-row-${trip.id}`)).toContainText('$12,000');
    await expect(ana.getByText('$1,200')).toHaveCount(0);
    await ana.close();
  });

  await test.step('José sees his rate only, with no commission', async () => {
    const page2 = await browser.newPage();
    await signInOnWeb(page2, 'jose');
    await page2.goto('/transportista/cobranza');
    const row = page2.getByTestId(`collections-row-${trip.id}`);
    await expect(row).toContainText('$10,800');
    await expect(page2.getByText('$12,000')).toHaveCount(0);
    await expect(page2.getByText('$1,200')).toHaveCount(0);
    await expect(page2.getByRole('heading', { name: freightCopy.collections.title })).toBeVisible();
    await page2.close();
  });
});
