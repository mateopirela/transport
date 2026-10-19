import { expect, type Page } from '@playwright/test';
import { authCopy, offersCopy } from '@transport/shared';

import { DEMO_PASSWORD, users, type DemoUser } from './demo';

const f = authCopy.fields;

/** Signs in on the web app ("Correo o teléfono") and waits to leave the sign-in page. */
export async function signInOnWeb(
  page: Page,
  user: DemoUser | { email: string; password: string } | { phone: string; password: string },
): Promise<void> {
  const { identifier, password } =
    typeof user === 'string'
      ? { identifier: users[user], password: DEMO_PASSWORD }
      : { identifier: 'email' in user ? user.email : user.phone, password: user.password };
  await page.goto('/login');
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
