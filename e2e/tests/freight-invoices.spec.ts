import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import {
  freightClientStatusLabels as clientLabels,
  freightInvoiceFailureLabels,
  freightInvoicesCopy,
  freightInvoiceValidationLabels,
  shortCfdiUuid,
} from '@transport/shared';

import { syntheticCfdi } from '../../packages/shared/src/freight/cfdi-fixtures';
import { ids } from '../support/demo';
import { SAMPLE_PDF, signInOnWeb } from '../support/web';

// Freight invoices (I5, D37), with the seed's settled trip: Monterrey →
// Guadalajara of Aceros del Norte (RFC ADN150301KQ2) with Transportes Regios
// (TRN120210LP5), $40,000 ($38,800 net at 3 %), already paid on both sides.
// Without a PAC nor Fulmis' RFC (the defaults) everything runs in manual
// mode: the admin uploads the CFDI issued elsewhere (an XML to the wrong
// receiver is refused with the reason), Ana downloads it from Cartera and the
// trip stays paid; Jorge uploads his CFDI to Fulmis from Cobranza and it is
// saved "Sin validar". Neither side sees the other's invoice.

const f = freightInvoicesCopy;
const trip = ids.paidTrip;

function xmlFile(xml: string) {
  return { name: 'cfdi.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) };
}

test('the admin uploads the client CFDI, the client downloads it and the carrier uploads its own', async ({
  page,
  browser,
}) => {
  const clientUuid = randomUUID();
  const carrierUuid = randomUUID();
  const admin = page;
  await signInOnWeb(admin, 'admin');
  await admin.goto('/admin/flete');
  const card = admin.getByTestId(`freight-row-${trip}`);
  const section = card.getByTestId('freight-client-invoice');

  await test.step('an XML to the wrong receiver is refused with the reason', async () => {
    await expect(section).toContainText(f.admin.noClientInvoice);
    await section.getByText(f.admin.upload, { exact: true }).click();
    const form = section.getByTestId('invoice-upload-fulmis_to_client');
    await form.getByLabel(f.admin.xml, { exact: true }).setInputFiles(
      xmlFile(
        syntheticCfdi({
          issuerRfc: 'FUL201015AB1',
          receiverRfc: 'EPR170620HT8',
          total: '40000.00',
          uuid: clientUuid,
        }),
      ),
    );
    await form.getByLabel(f.admin.pdf, { exact: true }).setInputFiles(SAMPLE_PDF);
    await form.getByRole('button', { name: f.admin.submit, exact: true }).click();
    await expect(form.getByText(freightInvoiceFailureLabels.receiver_mismatch)).toBeVisible();
  });

  await test.step('the right CFDI is registered and the paid trip stays paid', async () => {
    const form = section.getByTestId('invoice-upload-fulmis_to_client');
    await form.getByLabel(f.admin.xml, { exact: true }).setInputFiles(
      xmlFile(
        syntheticCfdi({
          issuerRfc: 'FUL201015AB1',
          receiverRfc: 'ADN150301KQ2',
          total: '40000.00',
          uuid: clientUuid,
        }),
      ),
    );
    await form.getByLabel(f.admin.pdf, { exact: true }).setInputFiles(SAMPLE_PDF);
    await form.getByRole('button', { name: f.admin.submit, exact: true }).click();
    const invoice = section.getByTestId('invoice-fulmis_to_client');
    await expect(invoice).toContainText(shortCfdiUuid(clientUuid));
    // Without fulmis.rfc, Fulmis' side was not checked.
    await expect(invoice).toContainText(freightInvoiceValidationLabels.unvalidated);
    await expect(card.getByTestId('freight-client-status')).toHaveText(clientLabels.paid);
  });

  const ana = await browser.newPage();
  await test.step('Ana downloads the invoice from Cartera', async () => {
    await signInOnWeb(ana, 'ana');
    await ana.goto('/cliente/cartera');
    const row = ana.getByTestId(`portfolio-row-${trip}`);
    await expect(row).toContainText(shortCfdiUuid(clientUuid));
    await expect(row).toContainText(clientLabels.paid);
    const [download] = await Promise.all([
      ana.waitForEvent('download'),
      row.getByRole('link', { name: f.download(f.downloadPdf) }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`CFDI-${shortCfdiUuid(clientUuid)}.pdf`);
    const [xml] = await Promise.all([
      ana.waitForEvent('download'),
      row.getByRole('link', { name: f.download(f.downloadXml) }).click(),
    ]);
    const content = await xml.createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
      return Buffer.concat(chunks).toString('utf8');
    });
    expect(content).toContain(clientUuid);
  });

  const jorge = await browser.newPage();
  await test.step('Jorge uploads his CFDI to Fulmis: saved "Sin validar"', async () => {
    await signInOnWeb(jorge, 'jorge');
    await jorge.goto('/transportista/cobranza');
    await expect(jorge.getByTestId('fulmis-fiscal-data')).toContainText(f.fulmis.inProcess);
    const row = jorge.getByTestId(`collections-row-${trip}`);
    await expect(row).toContainText(f.carrier.missing);
    // He never sees Fulmis' invoice to the client.
    await expect(jorge.getByText(shortCfdiUuid(clientUuid))).toHaveCount(0);
    await row.getByText(f.carrier.upload, { exact: true }).click();
    const form = row.getByTestId('invoice-upload-carrier_to_fulmis');
    await form.getByLabel(f.carrier.xml, { exact: true }).setInputFiles(
      xmlFile(
        syntheticCfdi({
          issuerRfc: 'TRN120210LP5',
          receiverRfc: 'FUL201015AB1',
          total: '38800.00',
          uuid: carrierUuid,
        }),
      ),
    );
    await form.getByRole('button', { name: f.carrier.submit, exact: true }).click();
    const invoice = row.getByTestId('invoice-carrier_to_fulmis');
    await expect(invoice).toContainText(shortCfdiUuid(carrierUuid));
    await expect(invoice).toContainText(freightInvoiceValidationLabels.unvalidated);
  });

  await test.step('Ana never sees the carrier invoice; the admin sees both', async () => {
    await ana.reload();
    await expect(ana.getByTestId(`portfolio-row-${trip}`)).toContainText(shortCfdiUuid(clientUuid));
    await expect(ana.getByText(shortCfdiUuid(carrierUuid))).toHaveCount(0);
    await admin.reload();
    await expect(card.getByTestId('freight-carrier-invoice')).toContainText(
      shortCfdiUuid(carrierUuid),
    );
  });

  await ana.close();
  await jorge.close();
});
