import { expect, type Page } from '@playwright/test';
import { authCopy, legalCopy, offersCopy } from '@transport/shared';

import { DEMO_PASSWORD, users, type DemoUser } from './demo';

const f = authCopy.fields;

/**
 * Signs in on the web app ("Correo o teléfono") and waits to leave the
 * sign-in page; with `next`, it lands there instead of the role's home.
 */
export async function signInOnWeb(
  page: Page,
  user: DemoUser | { email: string; password: string } | { phone: string; password: string },
  next?: string,
): Promise<void> {
  const { identifier, password } =
    typeof user === 'string'
      ? { identifier: users[user], password: DEMO_PASSWORD }
      : { identifier: 'email' in user ? user.email : user.phone, password: user.password };
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByLabel(f.identifier).fill(identifier);
  await page.getByLabel(f.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: authCopy.signIn.submit }).click();
  await expect(page).not.toHaveURL(/\/login/u);
}

/**
 * On a negotiation page: accepts the carrier's pending offer, confirming it.
 * The success notice may be replaced by the "contracted" state as soon as the
 * page revalidates, so either one counts.
 */
export async function acceptPendingOffer(page: Page): Promise<void> {
  const actions = offersCopy.actions;
  await page.getByText(actions.accept, { exact: true }).click();
  await page.getByRole('button', { name: actions.acceptConfirm }).click();
  await expect(
    page.getByText(actions.accepted).or(page.getByText(offersCopy.negotiation.contracted)).first(),
  ).toBeVisible();
}

/** A tiny PDF, enough for the document upload (type and size are checked). */
export const SAMPLE_PDF = {
  name: 'documento.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  ),
};

/** Ticks the terms checkbox of a sign-up form (I1): no account is created without it. */
export async function acceptTermsOnWeb(page: Page): Promise<void> {
  await page.getByLabel(legalCopy.acceptTerms.label).check();
}

/**
 * Confirms the dialog an admin action opened (docs/plan-fulmis.md §2 V5: an
 * action with an effect on money or on accounts asks first): presses the
 * dialog's own button, named `label`.
 */
export async function confirmDialog(page: Page, label: string): Promise<void> {
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
}
