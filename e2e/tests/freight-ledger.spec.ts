import { expect, test, type Page } from '@playwright/test';
import {
  freightCarrierStatusLabels as carrierLabels,
  freightClientStatusLabels as clientLabels,
  freightCopy,
  freightPaymentDirectionLabels,
} from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Freight ledger (I3, D33-E1, D34-E1), with the seed's acceptance trip:
// Escobedo → Saltillo of Aceros del Norte (30 days) with Transportes Regios, $10,000
// delivered four days ago at 3 %. Ana sees $10,000 with its due date and
// never the commission; Jorge sees $9,700 net; the admin records the
// client's SPEI payment, Ana sees it paid in Cartera and Jorge sees his
// payment "Programado", then "Pagado" once the admin records it too.
// Héctor (another business unit) does not see the trip.

const a = freightCopy.admin;
const trip = ids.ledgerTrip;

async function recordPayment(
  page: Page,
  direction: keyof typeof freightPaymentDirectionLabels,
  amount: string,
  reference: string,
): Promise<void> {
  const card = page.getByTestId(`freight-row-${trip}`);
  // Exact labels: "Pago" is also part of "Fecha del pago".
  const directionSelect = card.getByLabel(a.direction, { exact: true });
  // The form stays open after a payment: a second click would fold it.
  if (!(await directionSelect.isVisible())) {
    await card.getByText(a.recordPayment, { exact: true }).click();
  }
  await directionSelect.selectOption({ label: freightPaymentDirectionLabels[direction] });
  await card.getByLabel(a.paymentAmount, { exact: true }).fill(amount);
  await card.getByLabel(a.speiReference, { exact: true }).fill(reference);
  await card.getByRole('button', { name: a.save }).click();
  // The callers assert the resulting statuses: the last payment of a trip
  // removes the form (and its "saved" message) from the card.
}

test('each side sees its own amounts and the admin reconciles the SPEI payments', async ({
  page,
  browser,
}) => {
  const ana = page;
  await signInOnWeb(ana, 'ana');

  await test.step('Ana sees $10,000 due in 30 days, and no commission nor net', async () => {
    await ana.getByRole('link', { name: freightCopy.portfolio.title }).first().click();
    await expect(ana).toHaveURL(/\/cliente\/cartera/u);
    const row = ana.getByTestId(`portfolio-row-${trip}`);
    await expect(row).toContainText('General Escobedo → Saltillo');
    // The client's web writes whole pesos without `.00` (Fulmis, §1.5).
    await expect(row).toContainText('$10,000');
    await expect(row).toContainText(clientLabels.pending);
    await expect(ana.getByText(freightCopy.portfolio.termsNote('30 días'))).toBeVisible();
    await expect(ana.getByText('$9,700')).toHaveCount(0);
    await expect(ana.getByText('$300')).toHaveCount(0);
  });

  const jorge = await browser.newPage();
  await test.step('Jorge sees the freight, 3 % and $9,700 net', async () => {
    await signInOnWeb(jorge, 'jorge');
    await jorge.goto('/transportista/cobranza');
    const row = jorge.getByTestId(`collections-row-${trip}`);
    // Cobranza drops a whole `.00` (docs/plan-fulmis.md §1.5).
    await expect(row).toContainText('$10,000');
    await expect(row).toContainText('$300 · 3 %');
    await expect(row).toContainText('$9,700');
    await expect(row).toContainText(carrierLabels.pending);
  });

  await test.step('Andrea sees it too; Héctor, of another business unit, does not', async () => {
    const andrea = await browser.newPage();
    await signInOnWeb(andrea, 'andrea');
    await andrea.goto('/transportista/cobranza');
    await expect(andrea.getByTestId(`collections-row-${trip}`)).toContainText('$9,700');
    await andrea.close();
    const hector = await browser.newPage();
    await signInOnWeb(hector, 'hector');
    await hector.goto('/transportista/cobranza');
    await expect(
      hector.getByRole('heading', { name: freightCopy.collections.title }),
    ).toBeVisible();
    await expect(hector.getByTestId(`collections-row-${trip}`)).toHaveCount(0);
    await hector.close();
  });

  const admin = await browser.newPage();
  await test.step('the admin records the client payment', async () => {
    await signInOnWeb(admin, 'admin');
    await admin.getByRole('link', { name: a.nav, exact: true }).click();
    await expect(admin).toHaveURL(/\/admin\/flete/u);
    const card = admin.getByTestId(`freight-row-${trip}`);
    await expect(card).toContainText('$10,000.00');
    await expect(card).toContainText('$9,700.00');
    // D33-E1: the carrier is paid once the client paid, so only the client's
    // payment is offered until then.
    await expect(card).toContainText(a.carrierWaitsForClient);
    await card.getByText(a.recordPayment, { exact: true }).click();
    await expect(card.getByLabel(a.direction, { exact: true }).locator('option')).toHaveText([
      freightPaymentDirectionLabels.client_to_fulmis,
    ]);
    await recordPayment(admin, 'client_to_fulmis', '10,000', 'mban0100e2e00000000001');
    await expect(card.getByTestId('freight-client-status')).toHaveText(clientLabels.paid);
    await expect(card.getByTestId('freight-carrier-status')).toHaveText(carrierLabels.scheduled);
    await expect(card).not.toContainText(a.carrierWaitsForClient);
  });

  await test.step('Ana sees it paid, with its SPEI reference', async () => {
    await ana.reload();
    const row = ana.getByTestId(`portfolio-row-${trip}`);
    await expect(row).toContainText(clientLabels.paid);
    await expect(row).toContainText('MBAN0100E2E00000000001');
  });

  await test.step('Jorge sees his payment scheduled, then paid', async () => {
    await jorge.reload();
    const row = jorge.getByTestId(`collections-row-${trip}`);
    await expect(row).toContainText(carrierLabels.scheduled);
    await expect(row).not.toContainText('MBAN0100E2E00000000001');

    await recordPayment(admin, 'fulmis_to_carrier', '9,700', 'mban0100e2e00000000002');
    await expect(
      admin.getByTestId(`freight-row-${trip}`).getByTestId('freight-carrier-status'),
    ).toHaveText(carrierLabels.paid);

    await jorge.reload();
    await expect(row).toContainText(carrierLabels.paid);
    await expect(row).toContainText('MBAN0100E2E00000000002');
  });

  await admin.close();
  await jorge.close();
});
