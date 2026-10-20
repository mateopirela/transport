import { expect, test, type Page } from '@playwright/test';
import {
  adminCopy,
  authCopy,
  clientTripsCopy,
  loadsCopy,
  offersCopy,
  onboardingCopy,
  shellCopy,
  tripEventTypeLabels,
  tripStatusLabels,
} from '@transport/shared';

import {
  assignTrip,
  counterOffer,
  findTrip,
  makeOffer,
  pendingShipperOffer,
  recordTripEvent,
  signInAs,
} from '../support/actors';
import { hoursFromNow, testMoralRfc, toDateInput, toDateTimeLocal } from '../support/data';
import { carrierName, ids, places } from '../support/demo';
import { waitForConfirmationPath } from '../support/mailpit';
import { acceptPendingOffer, SAMPLE_PDF, signInOnWeb } from '../support/web';

// Web journey of a new shipper (B26): sign-up → verification → publish →
// negotiate → accept → follow the trip. The carrier and its operator answer
// through the RPCs of the mobile app (support/actors.ts).

const f = authCopy.fields;
const lf = loadsCopy.form;
const actions = offersCopy.actions;

const run = Date.now();
const shipper = {
  fullName: 'Paola Rodríguez',
  phone: '8112345678',
  email: `paola.e2e.${run}@demo.test`,
  password: 'Prueba1234',
  legalName: `Pruebas E2E ${run}, S.A. de C.V.`,
  rfc: testMoralRfc(run),
};

/** Uploads every document still missing, one form at a time. */
async function uploadMissingDocuments(page: Page) {
  const forms = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: onboardingCopy.documents.upload }) });
  await expect(forms.first()).toBeVisible();
  for (let left = await forms.count(); left > 0; left -= 1) {
    // A form leaves `forms` as soon as its upload starts (its button reads
    // "Subiendo…") and never comes back: once sent it only shows the
    // confirmation until the revalidated page removes it.
    const form = forms.first();
    await form.getByLabel(onboardingCopy.documents.file).setInputFiles(SAMPLE_PDF);
    const expiry = form.getByLabel(onboardingCopy.documents.expiresOn);
    if ((await expiry.count()) > 0) await expiry.fill(toDateInput(hoursFromNow(24 * 365)));
    await form.getByRole('button', { name: onboardingCopy.documents.upload }).click();
    await expect(forms).toHaveCount(left - 1);
  }
}

/** Admin: approves every pending document of the company, then the company. */
async function approveCompany(page: Page, legalName: string) {
  await page.goto('/admin/verificacion');
  // The company row of the queue (its documents are listed below it).
  await page.getByRole('row').filter({ hasText: legalName }).first().getByRole('link').click();
  const approve = page.getByRole('button', { name: adminCopy.document.approve, exact: true });
  await expect(approve.first()).toBeVisible();
  for (let left = await approve.count(); left > 0; left -= 1) {
    await approve.first().click();
    await expect(approve).toHaveCount(left - 1);
  }
  await page.getByRole('button', { name: adminCopy.companyActions.approve }).click();
  await expect(page.getByText(adminCopy.companyActions.done)).toBeVisible();
}

test('a new shipper signs up, gets verified, contracts a carrier and follows the trip', async ({
  page,
  browser,
}) => {
  await test.step('sign up and confirm the email', async () => {
    await page.goto('/registro');
    await page.getByLabel(f.fullName).fill(shipper.fullName);
    await page.getByLabel(f.phone).fill(shipper.phone);
    await page.getByLabel(f.email).fill(shipper.email);
    await page.getByLabel(f.password, { exact: true }).fill(shipper.password);
    await page.getByLabel(f.passwordConfirmation).fill(shipper.password);
    await page.getByLabel(f.personTypeMoral).check();
    await page.getByLabel(f.legalName).fill(shipper.legalName);
    await page.getByLabel(f.rfc).fill(shipper.rfc);
    // Fiscal data (D16, G2): the admin cannot approve a company without it.
    await page.getByLabel(f.legalRepresentativeName).fill(shipper.fullName);
    await page.getByLabel(f.fiscalStreet).fill('Av. Constitución');
    await page.getByLabel(f.fiscalExteriorNumber).fill('400');
    await page.getByLabel(f.fiscalNeighborhood).fill('Centro');
    await page.getByLabel(f.fiscalPostalCode).fill('64000');
    await page.getByLabel(f.fiscalMunicipality).fill('Monterrey');
    await page.getByLabel(f.fiscalState).selectOption('Nuevo León');
    await page.getByRole('button', { name: authCopy.signUp.submit }).click();
    // The screen's title is its h1 (U6), which Next's route announcer also reads out.
    await expect(page.getByRole('heading', { name: authCopy.checkEmail.title })).toBeVisible();

    await page.goto(await waitForConfirmationPath(shipper.email));
    await expect(page).toHaveURL(/\/cuenta-en-revision/u);
    await expect(
      page.getByRole('heading', { name: shellCopy.review.pending_review.title }),
    ).toBeVisible();
  });

  await test.step('upload the company documents', async () => {
    await uploadMissingDocuments(page);
    await expect(page.getByText(onboardingCopy.documents.allSent)).toBeVisible();
  });

  await test.step('the admin approves the documents and the company', async () => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signInOnWeb(admin, 'admin');
    await approveCompany(admin, shipper.legalName);
    await adminContext.close();
  });

  let loadId = '';
  await test.step('publish a load MTY → GDL', async () => {
    await page.goto('/cliente/cargas/nueva');
    await expect(page).toHaveURL(/\/cliente\/cargas\/nueva/u);
    const streets = page.getByRole('textbox', { name: lf.street });
    await page.locator('#field-origin').selectOption({ label: 'Monterrey, Nuevo León' });
    await streets.nth(0).fill('Av. Constitución 400, Centro');
    await page.locator('#field-destination').selectOption({ label: 'Guadalajara, Jalisco' });
    await streets.nth(1).fill('Av. Vallarta 3000, Vallarta Poniente');
    await page.getByLabel(lf.pickupStart).fill(toDateTimeLocal(hoursFromNow(24)));
    await page.getByLabel(lf.pickupEnd).fill(toDateTimeLocal(hoursFromNow(30)));
    await page.getByLabel(lf.deliveryStart).fill(toDateTimeLocal(hoursFromNow(40)));
    await page.getByLabel(lf.deliveryEnd).fill(toDateTimeLocal(hoursFromNow(52)));
    await page.getByLabel(lf.cargoType).selectOption('perishable');
    await page.getByLabel(lf.description).fill('Fruta fresca en tarimas');
    await page.getByLabel(lf.weightKg).fill('15000');
    await page.getByLabel(lf.unitType).selectOption('refrigerated');
    await page.getByLabel(lf.price).fill('38000');
    await page.getByRole('button', { name: lf.publish }).click();
    await expect(page).toHaveURL(/\/cliente\/cargas\/[0-9a-f-]{36}$/u);
    loadId = page.url().split('/').at(-1) ?? '';
    await expect(page.getByText(offersCopy.board.empty)).toBeVisible();
  });

  const jorge = await signInAs('jorge');

  await test.step('negotiate with the carrier', async () => {
    await makeOffer(jorge, {
      loadId,
      amountCents: 4_000_000,
      vehicleId: ids.reefer,
      conditions: 'Caja refrigerada a 4 °C.',
    });
    await page.reload();
    await page.getByRole('link', { name: offersCopy.board.open }).click();
    // The page heading (the same text can also appear in notifications).
    await expect(
      page.getByRole('heading', { name: offersCopy.negotiation.title(carrierName) }),
    ).toBeVisible();

    await page.getByText(actions.counter, { exact: true }).click();
    await page.getByLabel(actions.counterAmount).fill('37000');
    await page.getByRole('button', { name: actions.counterSubmit }).click();
    // With its counteroffer pending, the shipper has nothing to answer.
    await expect(page.getByText(actions.counter, { exact: true })).toHaveCount(0);

    await counterOffer(jorge, await pendingShipperOffer(jorge, loadId), 3_850_000);
  });

  await test.step('accept the carrier counteroffer', async () => {
    await page.reload();
    await acceptPendingOffer(page);
  });

  await test.step('the carrier assigns the trip and the operator departs', async () => {
    const trip = await findTrip(jorge, { loadId });
    expect(trip.status).toBe('pending_assignment');
    await assignTrip(jorge, {
      tripId: trip.id,
      vehicleId: ids.reefer,
      operatorId: ids.raulOperator,
    });
    const raul = await signInAs('raul');
    await recordTripEvent(raul, { tripId: trip.id, event: 'departed', at: places.monterrey });
  });

  await test.step('follow the trip', async () => {
    await page.goto(`/cliente/cargas/${loadId}`);
    await page.getByRole('link', { name: clientTripsCopy.loadLink }).click();
    await expect(page).toHaveURL(/\/cliente\/viajes\/[0-9a-f-]{36}$/u);
    await expect(page.getByRole('heading', { name: 'Monterrey → Guadalajara' })).toBeVisible();
    await expect(page.getByText(tripStatusLabels.en_route_to_pickup).first()).toBeVisible();
    await expect(
      page.getByText(tripEventTypeLabels.departed, { exact: true }).first(),
    ).toBeVisible();
  });
});
