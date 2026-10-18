import { expect, test } from '@playwright/test';
import { providerActionLabels, providerStateLabels, sharedDocumentsCopy } from '@transport/shared';

import { signInAs } from '../support/actors';
import { carrierName, ids } from '../support/demo';
import { SAMPLE_PDF, signInOnWeb } from '../support/web';

// Documents shared with the shipper and provider approval (G6, D21): on the
// MTY → GDL trip of Aceros del Norte, Ana sees the Constancia de situación
// fiscal of Transportes Regios (and the unit's and Pedro's documents, never
// an id), opens it through the logged 60-second signed URL and gives
// Transportes Regios the provider approval; Jorge, its Gerente, sees the
// approval and the view in the log. Demo data: supabase/seed.sql.

const c = sharedDocumentsCopy;
const CONSTANCIA = 'Constancia de situación fiscal';

test('the shipper sees the carrier documents of its trip and approves the carrier', async ({
  page,
}) => {
  const jorge = await signInAs('jorge');

  await test.step('the seed has no file for the document: Jorge uploads it', async () => {
    const { data, error } = await jorge
      .from('documents')
      .select('storage_path, requirement:document_requirements!inner(code)')
      .eq('owner_type', 'company')
      .eq('requirement.code', 'tax_status_certificate')
      .eq('status', 'approved')
      .is('archived_at', null)
      .single();
    if (error) throw new Error(error.message);
    const upload = await jorge.storage
      .from('documents')
      .upload(data.storage_path, SAMPLE_PDF.buffer, {
        contentType: SAMPLE_PDF.mimeType,
        upsert: false,
      });
    // A previous run already left it there.
    if (upload.error && !/exists/iu.test(upload.error.message)) throw upload.error;
  });

  await signInOnWeb(page, 'ana');
  await page.goto(`/cliente/viajes/${ids.unloadingTrip}`);
  const section = page.locator('section').filter({
    has: page.getByRole('heading', { name: c.client.title }),
  });

  await test.step('Ana sees the carrier, unit and operator documents, never an id', async () => {
    await expect(section.getByText(CONSTANCIA)).toBeVisible();
    await expect(section.getByText('Tarjeta de circulación')).toBeVisible();
    await expect(section.getByText('Licencia de conducir vigente')).toBeVisible();
    await expect(section.getByText('Identificación oficial')).toHaveCount(0);
    await expect(section.getByText('Identificación del representante legal')).toHaveCount(0);
  });

  await test.step('"Ver" opens a short-lived signed URL of Storage, and the view is logged', async () => {
    const { count: before } = await jorge
      .from('document_share_views')
      .select('id', { count: 'exact', head: true });
    const href = await section
      .getByRole('link', { name: c.client.viewLabel(CONSTANCIA) })
      .getAttribute('href');
    if (!href) throw new Error('the document has no link');
    // The browser session opens the viewer, which redirects to Storage.
    const viewer = await page.request.get(href, { maxRedirects: 0 });
    expect(viewer.status()).toBeGreaterThanOrEqual(300);
    expect(viewer.status()).toBeLessThan(400);
    const location = viewer.headers()['location'] ?? '';
    expect(location).toMatch(/\/storage\/v1\/object\/sign\/documents\/.+\?token=/u);
    expect(viewer.headers()['referrer-policy']).toBe('no-referrer');
    const file = await page.request.get(location);
    expect(file.status()).toBe(200);
    const { count: after } = await jorge
      .from('document_share_views')
      .select('id', { count: 'exact', head: true });
    expect(after).toBe((before ?? 0) + 1);
  });

  await test.step('Ana gives Transportes Regios the provider approval', async () => {
    const form = page.locator('form').filter({ hasText: c.provider.title });
    await expect(form.getByText(providerStateLabels.pending)).toBeVisible();
    await form.getByRole('button', { name: providerActionLabels.approved }).click();
    await expect(form.getByText(c.provider.saved.approved)).toBeVisible();
    await expect(form.getByText(providerStateLabels.approved)).toBeVisible();
  });

  await test.step('Jorge sees the approval of his company', async () => {
    const { data } = await jorge
      .from('provider_approvals')
      .select('status, carrier:companies!provider_approvals_carrier_company_id_fkey(legal_name)')
      .single();
    expect(data?.status).toBe('approved');
    expect(data?.carrier?.legal_name).toContain(carrierName);
  });
});
