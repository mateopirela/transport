import { expect, test, type Page } from '@playwright/test';
import { shareLinksCopy, tripStatusLabels, unitTypeLabels } from '@transport/shared';

import { findTrip, signInAs } from '../support/actors';
import { carrierName, ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Share links (G7, D23): the shipper shares the tracking of a trip (and a
// published load) with a public read-only link. A visitor without an account
// opens it and sees the status, the carrier and the masked plate, never the
// price, the addresses or the operator; the page is sent with no-referrer and
// noindex; once the shipper revokes the link, the visitor sees "ya no está
// disponible". Demo data: the MTY → GDL trip of Aceros del Norte (Ana) and the
// GDL → MTY load of Alimentos de Occidente (Luis), which is only read here.

const c = shareLinksCopy;
const TOKEN = /\/compartido\/[A-Za-z0-9_-]{43}$/u;

/** Opens the "Compartir" dialog, creates a link with the default validity and returns its URL. */
async function createLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: c.button }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: c.dialog.create }).click();
  await expect(dialog.getByText(c.dialog.created)).toBeVisible();
  const url = await dialog.getByLabel(c.dialog.link).inputValue();
  expect(url).toMatch(TOKEN);
  return url;
}

test('a visitor follows a tracking link until the shipper revokes it', async ({ browser }) => {
  const anaContext = await browser.newContext();
  const ana = await anaContext.newPage();
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  let url = '';

  await test.step('Ana shares the tracking of her trip', async () => {
    await signInOnWeb(ana, 'ana');
    await ana.goto(`/cliente/viajes/${ids.unloadingTrip}`);
    url = await createLink(ana);
  });

  await test.step('the visitor sees the sanitized tracking with private headers', async () => {
    const response = await visitor.goto(url);
    expect(response?.status()).toBe(200);
    const headers = response?.headers() ?? {};
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['cache-control']).toContain('no-store');
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/u);

    await expect(visitor.getByRole('heading', { name: 'Monterrey → Guadalajara' })).toBeVisible();
    await expect(visitor.getByText(carrierName, { exact: false }).first()).toBeVisible();
    // Earlier specs may have moved the trip on; whatever its status, the page shows it.
    const trip = await findTrip(await signInAs('ana'), { tripId: ids.unloadingTrip });
    await expect(visitor.getByText(tripStatusLabels[trip.status]).first()).toBeVisible();
    // The unit CS53-01 (plates 82UR4C) shows only its last three characters.
    await expect(
      visitor.getByText(c.public.unitValue(unitTypeLabels.dry_van, '***R4C')),
    ).toBeVisible();

    const body = await visitor.locator('body').innerText();
    expect(body).not.toContain('82UR4C');
    expect(body).not.toMatch(/\$|MXN|[Pp]recio/u);
    expect(body).not.toContain('Pedro');
    expect(body).not.toMatch(/Av\.|Calle|Blvd/u);
    expect(body).not.toContain('Aceros del Norte');
  });

  await test.step('Ana revokes the link and the visitor loses it', async () => {
    const dialog = ana.getByRole('dialog');
    await dialog.getByRole('button', { name: c.dialog.revoke }).first().click();
    await expect(dialog.getByText(c.dialog.noActiveLinks)).toBeVisible();

    await visitor.reload();
    await expect(visitor.getByRole('heading', { name: c.public.unavailableTitle })).toBeVisible();
    await expect(visitor.getByText(carrierName, { exact: false })).toHaveCount(0);
  });

  await test.step('an unknown token gets the same page', async () => {
    await visitor.goto(`/compartido/${'A'.repeat(43)}`);
    await expect(visitor.getByRole('heading', { name: c.public.unavailableTitle })).toBeVisible();
    await visitor.goto('/compartido/nope');
    await expect(visitor.getByRole('heading', { name: c.public.unavailableTitle })).toBeVisible();
  });

  await anaContext.close();
  await visitorContext.close();
});

test('a visitor sees a shared load without its price', async ({ browser }) => {
  const luisContext = await browser.newContext();
  const luis = await luisContext.newPage();
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();

  await signInOnWeb(luis, 'luis');
  await luis.goto(`/cliente/cargas/${ids.returnLoad}`);
  const url = await createLink(luis);

  await visitor.goto(url);
  await expect(visitor.getByRole('heading', { name: 'Guadalajara → Monterrey' })).toBeVisible();
  await expect(visitor.getByText(unitTypeLabels.dry_van).first()).toBeVisible();
  const body = await visitor.locator('body').innerText();
  expect(body).not.toMatch(/\$|MXN|[Pp]recio/u);
  expect(body).not.toContain('Alimentos de Occidente');
  expect(body).not.toMatch(/Av\.|Calle|Blvd/u);

  // The shipper still sees the price on their own screen.
  await expect(luis.getByText(/\$/u).first()).toBeVisible();

  await luisContext.close();
  await visitorContext.close();
});
