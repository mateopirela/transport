import { expect, test, type Page } from '@playwright/test';
import { carrierLoadsCopy, carrierWebCopy } from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Carrier web (G10a, D06-E1): the Coordinadora of the "Corredor MTY–GDL"
// business unit sees the GDL → MTY return load as the first recommendation of
// CS53-01 (the unit unloading in Guadalajara, B08) and offers the proposed
// price of a published dry-van load from the web; the Coordinador of
// "Regional Monterrey" sees neither the recommendation nor the negotiation
// (D19); the Gerente offers on another published load in the name of a
// business unit and only that unit's coordinator sees it. Demo data:
// supabase/seed.sql (docs/demo-local.md). The return load itself is left
// untouched: return-trip.spec.ts contracts it afterwards.

const RETURN_ROUTE = 'Guadalajara → Monterrey';
const LEON_ROUTE = 'León → Apodaca';
const FLATBED_ROUTE = 'Monterrey → Tlaquepaque';
const states = carrierLoadsCopy.negotiation.states;

/** Rows of the negotiations list that mention a route. */
async function negotiationRows(page: Page, route: string) {
  await page.goto('/transportista/negociaciones');
  await expect(
    page.getByRole('heading', { name: carrierWebCopy.negotiations.title }),
  ).toBeVisible();
  return page.getByRole('row').filter({ hasText: route });
}

test('the carrier staff negotiate on the web within their business units', async ({ browser }) => {
  const andreaContext = await browser.newContext();
  const andrea = await andreaContext.newPage();
  const hectorContext = await browser.newContext();
  const hector = await hectorContext.newPage();

  await test.step('Andrea lands on the carrier home with the return trip of CS53-01', async () => {
    await signInOnWeb(andrea, 'andrea');
    await expect(andrea).toHaveURL(/\/transportista$/u);
    await expect(
      andrea.getByRole('heading', { name: carrierLoadsCopy.home.returnTrips }),
    ).toBeVisible();
    await expect(andrea.getByText('CS53-01').first()).toBeVisible();
    const first = andrea.getByRole('listitem').filter({ hasText: RETURN_ROUTE }).first();
    await expect(first).toBeVisible();
    await expect(first.getByText(carrierWebCopy.home.rank(1))).toBeVisible();
    await expect(first.getByRole('link', { name: carrierWebCopy.home.seeLoad })).toHaveAttribute(
      'href',
      new RegExp(`/transportista/cargas/${ids.returnLoad}`, 'u'),
    );
  });

  await test.step('Andrea finds a dry-van load and offers the proposed price', async () => {
    await andrea.goto('/transportista/cargas?unidad=dry_van');
    await andrea
      .getByRole('row')
      .filter({ hasText: LEON_ROUTE })
      .getByRole('link', { name: carrierWebCopy.loads.open })
      .click();
    await expect(andrea).toHaveURL(new RegExp(`/transportista/cargas/${ids.leonLoad}`, 'u'));
    await expect(andrea.getByText(states.open)).toBeVisible();
    await andrea.getByText(carrierLoadsCopy.actions.acceptProposed, { exact: true }).click();
    await andrea.getByRole('button', { name: carrierWebCopy.offer.acceptProposedConfirm }).click();
    await expect(andrea.getByText(states.awaiting_shipper)).toBeVisible();
    // The withdraw action replaces the offer actions while the shipper answers.
    await expect(
      andrea.getByText(carrierLoadsCopy.actions.withdraw, { exact: true }),
    ).toBeVisible();
    await expect(await negotiationRows(andrea, LEON_ROUTE)).toHaveCount(1);
  });

  await test.step('Héctor sees neither the recommendation nor the negotiation', async () => {
    await signInOnWeb(hector, 'hector');
    await expect(hector).toHaveURL(/\/transportista$/u);
    await expect(
      hector.getByRole('heading', { name: carrierLoadsCopy.home.recommended }),
    ).toBeVisible();
    await expect(hector.getByText(RETURN_ROUTE)).toHaveCount(0);
    await expect(hector.getByText('CS53-01')).toHaveCount(0);
    await negotiationRows(hector, LEON_ROUTE);
    await expect(hector.getByText(carrierWebCopy.negotiations.empty)).toBeVisible();
  });

  const jorgeContext = await browser.newContext();
  const jorge = await jorgeContext.newPage();
  await test.step('Jorge offers on a published load for "Regional Monterrey"', async () => {
    await signInOnWeb(jorge, 'jorge');
    await jorge.goto(`/transportista/cargas/${ids.flatbedLoad}`);
    await expect(jorge.getByRole('heading', { name: FLATBED_ROUTE })).toBeVisible();
    await jorge.getByText(carrierLoadsCopy.actions.negotiate, { exact: true }).click();
    // The offer form (the business unit picker of the nav has the same label).
    const form = jorge
      .locator('form')
      .filter({ has: jorge.getByRole('button', { name: carrierWebCopy.offer.submit }) });
    await form.getByLabel(carrierWebCopy.offer.amount).fill('46,000');
    await form.getByLabel(carrierWebCopy.offer.unitField).selectOption({ index: 0 });
    await form
      .getByLabel(carrierWebCopy.offer.businessUnitField)
      .selectOption({ label: 'Regional Monterrey' });
    await form.getByRole('button', { name: carrierWebCopy.offer.submit }).click();
    await expect(jorge.getByText(states.awaiting_shipper)).toBeVisible();
    await expect(jorge.getByText('$46,000.00').first()).toBeVisible();
  });

  await test.step('each coordinator sees only the negotiations of their business unit', async () => {
    await expect(await negotiationRows(hector, FLATBED_ROUTE)).toHaveCount(1);
    await expect(await negotiationRows(hector, LEON_ROUTE)).toHaveCount(0);
    await expect(await negotiationRows(andrea, FLATBED_ROUTE)).toHaveCount(0);
    await expect(await negotiationRows(andrea, LEON_ROUTE)).toHaveCount(1);
    await expect(await negotiationRows(jorge, FLATBED_ROUTE)).toHaveCount(1);
    await expect(await negotiationRows(jorge, LEON_ROUTE)).toHaveCount(1);
  });

  await Promise.all([andreaContext.close(), hectorContext.close(), jorgeContext.close()]);
});
