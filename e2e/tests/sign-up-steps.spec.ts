import { expect, test, type Page } from '@playwright/test';
import { authCopy, invitationUrl, legalCopy, validationMessages } from '@transport/shared';

import { signInAs } from '../support/actors';
import { carrierName } from '../support/demo';
import { baseURL } from '../support/env';
import { acceptTermsOnWeb } from '../support/web';

// The sign-up in steps and the way in by invitation (R1, D42, D43):
//   * step 1 is checked before step 2, "Regresar" loses nothing (not even
//     the passwords) and a persona física has a "Nombre fiscal" and no
//     "Representante legal";
//   * a field of step 1 that the server rejects brings the form back to
//     step 1, with the error on the field and the rest as typed;
//   * "Únete con tu invitación" leads from the sign-in and the sign-up to
//     /invitacion, where a pasted link opens its invitation.
// No account is created: the only sign-up sent is rejected by the server.

const f = authCopy.fields;
const c = authCopy.signUp;

const person = {
  fullName: 'Lucía Hernández',
  phone: '8155550199',
  email: 'lucia.pasos@demo.test',
  password: 'Prueba1234',
};

async function fillAccount(page: Page): Promise<void> {
  await page.getByLabel(authCopy.registrationKinds.owner_operator).check();
  await page.getByLabel(f.fullName).fill(person.fullName);
  await page.getByLabel(f.phone).fill(person.phone);
  await page.getByLabel(f.email).fill(person.email);
  await page.getByLabel(f.password, { exact: true }).fill(person.password);
  await page.getByLabel(f.passwordConfirmation).fill(person.password);
}

async function fillFiscalAsFisica(page: Page): Promise<void> {
  await page.getByLabel(f.personTypeFisica).check();
  await page.getByLabel(f.fiscalName).fill(person.fullName);
  await page.getByLabel(f.rfc).fill('HEGL800101AB1');
  await page.getByLabel(f.fiscalStreet).fill('Av. Constitución');
  await page.getByLabel(f.fiscalExteriorNumber).fill('400');
  await page.getByLabel(f.fiscalNeighborhood).fill('Centro');
  await page.getByLabel(f.fiscalPostalCode).fill('64000');
  await page.getByLabel(f.fiscalMunicipality).fill('Monterrey');
  await page.getByLabel(f.fiscalState).selectOption('Nuevo León');
}

const step2Title = () => ({ name: c.companySection, level: 3 }) as const;

test('the sign-up goes in two steps and back without losing anything', async ({ page }) => {
  await page.goto('/registro');
  const steps = page.getByRole('list', { name: c.stepsLabel });
  await expect(steps.getByRole('listitem')).toHaveCount(5);
  await expect(steps.locator('[aria-current="step"]')).toContainText(c.steps.account);

  await test.step('the Gerente reads who runs the company account', async () => {
    await expect(page.getByText(authCopy.registrationKinds.managerNote)).toHaveCount(0);
    await page.getByLabel(authCopy.registrationKinds.carrier).check();
    await expect(page.getByText(authCopy.registrationKinds.managerNote)).toBeVisible();
  });

  await test.step('step 1 is checked before going on, on the field that failed', async () => {
    await fillAccount(page);
    await page.getByLabel(f.passwordConfirmation).fill('Otra12345');
    await page.getByRole('button', { name: c.next }).click();
    await expect(page.getByRole('heading', step2Title())).toBeHidden();
    const confirmation = page.getByLabel(f.passwordConfirmation);
    await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    await expect(confirmation).toBeFocused();
    await expect(page.getByLabel(f.email)).toHaveValue(person.email);
  });

  await test.step('the passwords can be shown and hidden', async () => {
    const password = page.getByLabel(f.password, { exact: true });
    const toggle = page.getByRole('button', { name: f.showPassword }).first();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  await test.step('step 2: a persona física has a fiscal name and no representative', async () => {
    await page.getByLabel(f.passwordConfirmation).fill(person.password);
    await page.getByRole('button', { name: c.next }).click();
    await expect(page.getByRole('heading', step2Title())).toBeVisible();
    await expect(steps.locator('[aria-current="step"]')).toContainText(c.steps.fiscal);
    await expect(page.getByLabel(f.legalRepresentativeName)).toBeVisible();
    await fillFiscalAsFisica(page);
    await expect(page.getByLabel(f.legalRepresentativeName)).toBeHidden();
    await expect(page.getByLabel(f.legalName, { exact: true })).toHaveCount(0);
  });

  await test.step('"Regresar" keeps step 1, passwords included, and step 2', async () => {
    await page.getByRole('button', { name: c.back }).click();
    await expect(page.getByLabel(f.fullName)).toBeVisible();
    await expect(page.getByLabel(f.fullName)).toHaveValue(person.fullName);
    await expect(page.getByLabel(f.email)).toHaveValue(person.email);
    await expect(page.getByLabel(f.password, { exact: true })).toHaveValue(person.password);
    await expect(page.getByLabel(f.passwordConfirmation)).toHaveValue(person.password);
    await page.getByRole('button', { name: c.next }).click();
    await expect(page.getByLabel(f.fiscalName)).toHaveValue(person.fullName);
    await expect(page.getByLabel(f.rfc)).toHaveValue('HEGL800101AB1');
  });
});

test('a field of step 1 the server rejects brings back step 1 as typed', async ({ page }) => {
  await page.goto('/registro');
  await fillAccount(page);
  await page.getByRole('button', { name: c.next }).click();
  await fillFiscalAsFisica(page);
  await acceptTermsOnWeb(page);
  // The browser already checked step 1: change the hidden email behind its
  // back, as a server-side rejection of that field would (a taken email).
  await page.locator('#field-email').evaluate((input: HTMLInputElement) => {
    input.value = 'no-es-un-correo';
  });
  await page.getByRole('button', { name: c.submit }).click();

  const email = page.getByLabel(f.email);
  await expect(email).toBeVisible();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(validationMessages.email)).toBeVisible();
  await expect(page.getByLabel(f.fullName)).toHaveValue(person.fullName);
  await expect(page.getByLabel(f.password, { exact: true })).toHaveValue(person.password);
  await page.getByLabel(f.email).fill(person.email);
  await page.getByRole('button', { name: c.next }).click();
  await expect(page.getByLabel(f.fiscalName)).toHaveValue(person.fullName);
  await expect(page.getByLabel(legalCopy.acceptTerms.label)).toBeChecked();
});

test('an invitation is pasted from the sign-in and from the sign-up', async ({ page }) => {
  const j = authCopy.joinInvitation;
  const entry = authCopy.invitationEntry;

  await test.step('from the sign-up, under the kinds', async () => {
    await page.goto('/registro');
    await page.getByRole('link', { name: entry.link }).click();
    await expect(page.getByRole('heading', { name: j.title, level: 1 })).toBeVisible();
  });

  await test.step('from the sign-in; a text that is not a link is said on the field', async () => {
    await page.goto('/login');
    await expect(page.getByText(entry.question)).toBeVisible();
    await page.getByRole('link', { name: entry.link }).click();
    await expect(page).toHaveURL(/\/invitacion$/u);
    await page.getByLabel(j.field).fill('hola, este es mi código');
    await page.getByRole('button', { name: j.submit }).click();
    await expect(page.getByText(j.invalid)).toBeVisible();
    await expect(page.getByLabel(j.field)).toHaveAttribute('aria-invalid', 'true');
  });

  await test.step('a pasted link opens its invitation', async () => {
    const jorge = await signInAs('jorge');
    const { data, error } = await jorge.rpc('create_invitation', {
      p_kind: 'coordinator',
      p_business_unit_ids: ['5eed0009-0000-4000-8000-000000000002'],
    });
    const token = data?.[0]?.token;
    if (error || !token) throw new Error(`create_invitation failed: ${error?.message ?? 'no row'}`);
    await page.getByLabel(j.field).fill(`  ${invitationUrl(baseURL, token)}  `);
    await page.getByRole('button', { name: j.submit }).click();
    await expect(page).toHaveURL(new RegExp(`/invitacion/${token}$`, 'u'));
    await expect(page.getByText(/te invita como Coordinador/u)).toContainText(carrierName);
  });
});
