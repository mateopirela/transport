import { expect, test, type Page } from '@playwright/test';
import {
  authCopy,
  fleetCopy,
  onboardingCopy,
  onboardingStepsCopy,
  vehicleKindLabels,
} from '@transport/shared';

import { hoursFromNow, testMoralRfc, toDateInput } from '../support/data';
import { waitForConfirmationPath } from '../support/mailpit';
import { acceptTermsOnWeb, signInOnWeb } from '../support/web';

// Steps 3, 4 and 5 of the sign-up on the web (R3, D42–D44): a new
// hombre-camión confirms his email and lands on step 3 (the common
// documents), registers his truck and sends its documents and his own as its
// operator, selfie included, in step 4, and sees everything in review in
// step 5. The admin then finds his selfie next to his official id.

const f = authCopy.fields;
const s = onboardingStepsCopy;
const run = Date.now();
const owner = {
  fullName: 'Ramiro Pasos',
  phone: '8155550123',
  email: `ramiro.pasos.${run}@demo.test`,
  password: 'Prueba1234',
  legalName: `Ramiro Pasos ${run}, S.A. de C.V.`,
  rfc: testMoralRfc(run + 7),
};

/** A 1×1 PNG: the selfie and the ids are photos (the admin sees them as images). */
const SAMPLE_PNG = {
  name: 'foto.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
};

/** Sends every document of the step still missing, one form at a time. */
async function uploadAll(page: Page) {
  const forms = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: onboardingCopy.documents.upload }) });
  await expect(forms.first()).toBeVisible();
  for (let left = await forms.count(); left > 0; left -= 1) {
    const form = forms.first();
    await form.getByLabel(onboardingCopy.documents.file).setInputFiles(SAMPLE_PNG);
    const expiry = form.getByLabel(onboardingCopy.documents.expiresOn);
    if ((await expiry.count()) > 0) await expiry.fill(toDateInput(hoursFromNow(24 * 365)));
    await form.getByRole('button', { name: onboardingCopy.documents.upload }).click();
    await expect(forms).toHaveCount(left - 1);
  }
}

test('a hombre-camión goes through documents, his truck and his own, and verification', async ({
  page,
  browser,
}) => {
  await test.step('sign up and confirm the email', async () => {
    await page.goto('/registro');
    await page.getByLabel(authCopy.registrationKinds.owner_operator).check();
    await page.getByLabel(f.fullName).fill(owner.fullName);
    await page.getByLabel(f.phone).fill(owner.phone);
    await page.getByLabel(f.email).fill(owner.email);
    await page.getByLabel(f.password, { exact: true }).fill(owner.password);
    await page.getByLabel(f.passwordConfirmation).fill(owner.password);
    await page.getByRole('button', { name: authCopy.signUp.next }).click();
    await page.getByLabel(f.personTypeMoral).check();
    await page.getByLabel(f.legalName).fill(owner.legalName);
    await page.getByLabel(f.rfc).fill(owner.rfc);
    await page.getByLabel(f.legalRepresentativeName).fill(owner.fullName);
    await page.getByLabel(f.fiscalStreet).fill('Av. Constitución');
    await page.getByLabel(f.fiscalExteriorNumber).fill('400');
    await page.getByLabel(f.fiscalNeighborhood).fill('Centro');
    await page.getByLabel(f.fiscalPostalCode).fill('64000');
    await page.getByLabel(f.fiscalMunicipality).fill('Monterrey');
    await page.getByLabel(f.fiscalState).selectOption('Nuevo León');
    await acceptTermsOnWeb(page);
    await page.getByRole('button', { name: authCopy.signUp.submit }).click();
    await expect(page.getByRole('heading', { name: authCopy.checkEmail.title })).toBeVisible();
    await page.goto(await waitForConfirmationPath(owner.email));
  });

  await test.step('step 3: the common documents, with the steps indicator', async () => {
    await expect(page).toHaveURL(/\/cuenta-en-revision\?paso=3$/u);
    const steps = page.getByRole('list', { name: s.label });
    await expect(steps.getByRole('listitem')).toHaveCount(5);
    await expect(steps.locator('[aria-current="step"]')).toContainText(
      authCopy.signUp.steps.documents,
    );
    await expect(page.getByRole('heading', { name: s.titles.documents })).toBeVisible();
    await uploadAll(page);
    await page.getByRole('link', { name: s.next }).click();
  });

  await test.step('step 4: he registers his truck and stays on the step', async () => {
    await expect(page).toHaveURL(/\?paso=4$/u);
    await expect(page.getByText(s.ownerOperator.noUnits)).toBeVisible();
    await page
      .getByLabel(fleetCopy.units.kindLabel)
      .selectOption({ label: vehicleKindLabels.tractor });
    await page.getByLabel(fleetCopy.units.plateLabel).fill(`RP${String(run).slice(-5)}`);
    await page.getByRole('button', { name: fleetCopy.units.save }).click();
    await expect(page).toHaveURL(/\/cuenta-en-revision\?paso=4$/u);
    await expect(page.getByText(s.ownerOperator.noUnits)).toHaveCount(0);
  });

  await test.step('step 4: the truck documents and his own as its operator, selfie included', async () => {
    await expect(page.getByRole('heading', { name: s.groups.personal })).toBeVisible();
    await expect(page.getByText(s.selfieNote)).toBeVisible();
    await uploadAll(page);
    await page.getByRole('link', { name: s.next }).click();
  });

  await test.step('step 5: everything is in review', async () => {
    await expect(page).toHaveURL(/\?paso=5$/u);
    await expect(page.getByText(s.summary.inReview).first()).toBeVisible();
    // "Regresar" goes back to step 4 without losing anything sent.
    await page.getByRole('link', { name: s.back }).click();
    await expect(page).toHaveURL(/\?paso=4$/u);
  });

  await test.step('the admin sees the selfie next to the official id', async () => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signInOnWeb(admin, 'admin');
    await admin.goto('/admin/verificacion');
    await admin
      .getByRole('row')
      .filter({ hasText: owner.legalName })
      .first()
      .getByRole('link')
      .click();
    const identity = admin.getByRole('region', { name: s.identity.title });
    await expect(identity).toBeVisible();
    await expect(
      identity.getByRole('img', { name: s.identity.imageAlt(s.identity.selfie, owner.fullName) }),
    ).toBeVisible();
    await expect(
      identity.getByRole('img', {
        name: s.identity.imageAlt(s.identity.officialId, owner.fullName),
      }),
    ).toBeVisible();
    await adminContext.close();
  });
});
