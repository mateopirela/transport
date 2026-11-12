import { expect, test } from '@playwright/test';
import {
  adminCopy,
  adminPanelCopy,
  cargoInsuranceCopy,
  formatDate,
  notificationContent,
  onboardingCopy,
  requirementStateLabels,
  tripStatusLabels,
} from '@transport/shared';

import {
  acceptOffer,
  assignTrip,
  findTrip,
  makeOffer,
  publishLoad,
  recordTripEvent,
  signInAs,
} from '../support/actors';
import { hoursFromNow, toDateInput } from '../support/data';
import { ids, places } from '../support/demo';
import { confirmDialog, SAMPLE_PDF, signInOnWeb } from '../support/web';

// I1 (D35-E1), the acceptance of the block on the seed: Luis (Alimentos de
// Occidente) has no annual cargo insurance policy. José, the hombre-camión,
// takes his load with JSM-01 and cannot leave; Luis sees why on the trip,
// uploads his annual policy in "Documentos de la empresa", the admin approves
// it, the same trip is covered and José leaves. Demo data: supabase/seed.sql.

const c = cargoInsuranceCopy;
const expiresAt = hoursFromNow(24 * 365);

test('a trip without cargo insurance cannot leave until the annual policy is approved', async ({
  browser,
  page,
}) => {
  const luis = await signInAs('luis');
  const jose = await signInAs('jose');
  let tripId = '';

  await test.step("José takes Luis's load with JSM-01, and cannot leave", async () => {
    const loadId = await publishLoad(luis, { unitType: 'torton', weightKg: 9000 });
    const offerId = await makeOffer(jose, {
      loadId,
      amountCents: 2_500_000,
      vehicleId: ids.jsmUnit,
    });
    await acceptOffer(luis, offerId);
    tripId = (await findTrip(jose, { loadId })).id;
    await assignTrip(jose, { tripId, vehicleId: ids.jsmUnit, operatorId: ids.joseOperator });
    await expect(
      recordTripEvent(jose, { tripId, event: 'departed', at: places.monterrey }),
    ).rejects.toThrow('trip documents are missing: cargo_insurance');
  });

  await test.step('Luis is told, and sees why on the trip', async () => {
    await signInOnWeb(page, 'luis');
    await page.goto('/cliente/notificaciones');
    await expect(
      page.getByText(notificationContent('cargo_insurance_missing', {}).title).first(),
    ).toBeVisible();
    await page.goto(`/cliente/viajes/${tripId}`);
    await expect(page.getByTestId('cargo-insurance-state')).toHaveText(c.state.missing);
    await expect(page.getByText(c.blocks)).toBeVisible();
    // The upload of the policy of the trip is there too.
    await expect(page.getByText(c.upload, { exact: true })).toBeVisible();
  });

  await test.step('Luis uploads his annual policy in Documentos de la empresa', async () => {
    await page.getByRole('link', { name: c.annualLink }).click();
    await expect(page).toHaveURL(/\/cliente\/empresa$/u);
    const row = page.getByRole('listitem').filter({ hasText: 'Póliza de seguro de la mercancía' });
    await row.getByLabel(onboardingCopy.documents.file).setInputFiles(SAMPLE_PDF);
    await row.getByLabel(onboardingCopy.documents.expiresOn).fill(toDateInput(expiresAt));
    await row.getByRole('button', { name: onboardingCopy.documents.upload }).click();
    await expect(row.getByText(requirementStateLabels.pending_review)).toBeVisible();
  });

  await test.step('the admin approves it like any other document', async () => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signInOnWeb(admin, 'admin');
    await admin.goto(`/admin/empresas/${ids.luisCompany}`);
    const approve = admin.getByRole('button', { name: adminCopy.document.approve, exact: true });
    await expect(approve).toHaveCount(1);
    await approve.click();
    await confirmDialog(admin, adminPanelCopy.confirm.approveDocument.confirm);
    await expect(approve).toHaveCount(0);
    await adminContext.close();
  });

  await test.step('the same trip is covered and José leaves', async () => {
    await page.goto(`/cliente/viajes/${tripId}`);
    await expect(page.getByTestId('cargo-insurance-state')).toHaveText(
      c.state.annual_policy(formatDate(expiresAt)),
    );
    await recordTripEvent(jose, { tripId, event: 'departed', at: places.monterrey });
    expect((await findTrip(luis, { tripId })).status).toBe('en_route_to_pickup');
  });

  await test.step('José sees the state on the web, not the policy', async () => {
    const joseContext = await browser.newContext();
    const josePage = await joseContext.newPage();
    await signInOnWeb(josePage, 'jose');
    await josePage.goto(`/transportista/viajes/${tripId}`);
    await expect(josePage.getByTestId('cargo-insurance-state')).toHaveText(
      c.state.annual_policy(formatDate(expiresAt)),
    );
    await expect(josePage.getByText(tripStatusLabels.en_route_to_pickup).first()).toBeVisible();
    await joseContext.close();
  });
});
