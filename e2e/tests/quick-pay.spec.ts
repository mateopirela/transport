import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import {
  freightCarrierStatusLabels as carrierLabels,
  freightClientStatusLabels as clientLabels,
  freightCopy,
  freightInvoicesCopy,
  freightPaymentDirectionLabels,
  quickPayBlockerLabels,
  quickPayCopy,
} from '@transport/shared';

import { syntheticCfdi } from '../../packages/shared/src/freight/cfdi-fixtures';
import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Quick pay (I4, D38), with the seed's held trip: Monterrey → Guadalajara of
// Aceros del Norte with Transportes Regios, $40,000 ($38,800 net at 3 %),
// delivered five weeks ago; Ana has not paid (overdue) and Jorge's payment
// is held. Jorge uploads his CFDI to Fulmis, asks for the quick pay and sees
// the 2.5 % fee ($970) and what he gets ($37,830) before confirming; the
// admin approves it and records the SPEI payment. Ana still owes $40,000 and
// never sees any of it.

const q = quickPayCopy;
const a = freightCopy.admin;
const trip = ids.heldTrip;

test('the carrier asks for the quick pay, the admin approves and pays it, the client still owes', async ({
  page,
  browser,
}) => {
  const jorge = page;
  await signInOnWeb(jorge, 'jorge');
  await jorge.goto('/transportista/cobranza');
  const row = jorge.getByTestId(`collections-row-${trip}`);

  await test.step('without his CFDI, Jorge is told to upload it first', async () => {
    await expect(row).toContainText(carrierLabels.on_hold);
    await expect(row).toContainText(quickPayBlockerLabels.invoice_missing);
    await expect(row.getByText(q.carrier.request, { exact: true })).toHaveCount(0);
    await row.getByText(freightInvoicesCopy.carrier.upload, { exact: true }).click();
    const form = row.getByTestId('invoice-upload-carrier_to_fulmis');
    await form.getByLabel(freightInvoicesCopy.carrier.xml, { exact: true }).setInputFiles({
      name: 'cfdi.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(
        syntheticCfdi({
          issuerRfc: 'TRN120210LP5',
          receiverRfc: 'FUL201015AB1',
          total: '38800.00',
          uuid: randomUUID(),
        }),
      ),
    });
    await form
      .getByRole('button', { name: freightInvoicesCopy.carrier.submit, exact: true })
      .click();
    await expect(row.getByTestId('invoice-carrier_to_fulmis')).toBeVisible();
  });

  await test.step('he sees the fee and what he gets before confirming', async () => {
    await jorge.reload();
    await row.getByText(q.carrier.request, { exact: true }).click();
    const form = row.getByTestId(`quick-pay-request-${trip}`);
    await expect(form.getByText(q.carrier.fee('2.5 %'))).toBeVisible();
    await expect(form.getByTestId('quick-pay-fee')).toHaveText('$970.00');
    await expect(form.getByTestId('quick-pay-net')).toHaveText('$37,830.00');
    await form.getByRole('button', { name: q.carrier.confirm }).click();
    // The page comes back with the request in place of the form.
    await expect(row).toContainText(carrierLabels.quick_pay_requested);
    await expect(row.getByTestId('quick-pay-status')).toHaveText(q.carrier.requested('$37,830.00'));
  });

  const ana = await browser.newPage();
  await test.step('Ana still owes $40,000 and sees nothing of it', async () => {
    await signInOnWeb(ana, 'ana');
    await ana.goto('/cliente/cartera');
    const portfolio = ana.getByTestId(`portfolio-row-${trip}`);
    await expect(portfolio).toContainText('$40,000.00');
    await expect(portfolio).toContainText(clientLabels.overdue);
    await expect(ana.getByText('$37,830.00')).toHaveCount(0);
    await expect(ana.getByText('$970.00')).toHaveCount(0);
    await expect(ana.getByText(q.title)).toHaveCount(0);
  });

  const admin = await browser.newPage();
  const card = admin.getByTestId(`freight-row-${trip}`);
  const directionSelect = card.getByLabel(a.direction, { exact: true });
  await test.step('the admin finds it under "Pago rápido" and approves it', async () => {
    await signInOnWeb(admin, 'admin');
    await admin.goto('/admin/flete?filtro=rapido');
    const quickPay = card.getByTestId('freight-quick-pay');
    await expect(quickPay).toContainText('$970.00');
    await expect(quickPay).toContainText('$37,830.00');
    await expect(quickPay).toContainText(q.admin.clientUnchanged);
    // No payment to the carrier while the request waits.
    await card.getByText(a.recordPayment, { exact: true }).click();
    await expect(
      directionSelect.locator('option', {
        hasText: freightPaymentDirectionLabels.fulmis_to_carrier,
      }),
    ).toHaveCount(0);

    // Approved, it leaves the filter: approve it from the whole ledger.
    await admin.goto('/admin/flete');
    await quickPay.getByRole('button', { name: q.admin.approve }).click();
    await expect(card.getByTestId('freight-carrier-status')).toHaveText(carrierLabels.scheduled);
    await expect(card.getByTestId('freight-client-status')).toHaveText(clientLabels.overdue);
    await expect(quickPay.getByRole('button', { name: q.admin.approve })).toHaveCount(0);
    await admin.reload();
    await expect(admin.getByTestId('quick-pay-exposure')).toContainText('$37,830.00');
  });

  await test.step('the admin records the $37,830 sent; Jorge is paid', async () => {
    if (!(await directionSelect.isVisible())) {
      await card.getByText(a.recordPayment, { exact: true }).click();
    }
    await directionSelect.selectOption({ label: freightPaymentDirectionLabels.fulmis_to_carrier });
    await card.getByLabel(a.paymentAmount, { exact: true }).fill('37,830');
    await card.getByLabel(a.speiReference, { exact: true }).fill('mban0100e2e00000000004');
    await card.getByRole('button', { name: a.save }).click();
    await expect(card.getByTestId('freight-carrier-status')).toHaveText(carrierLabels.paid);

    await jorge.reload();
    await expect(row).toContainText(carrierLabels.paid);
    await expect(row.getByTestId('quick-pay-status')).toHaveText(q.carrier.approved('$37,830.00'));
    await expect(row).toContainText('MBAN0100E2E00000000004');
  });

  await test.step('Ana still owes the $40,000 at her terms', async () => {
    await ana.reload();
    const portfolio = ana.getByTestId(`portfolio-row-${trip}`);
    await expect(portfolio).toContainText('$40,000.00');
    await expect(portfolio).toContainText(clientLabels.overdue);
    await expect(portfolio).not.toContainText('MBAN0100E2E00000000004');
  });

  await ana.close();
  await admin.close();
});
