import { expect, type Page } from '@playwright/test';
import { authCopy } from '@transport/shared';

import { DEMO_PASSWORD, users, type DemoUser } from './demo';

const f = authCopy.fields;

/** Signs in on the web app and waits to leave the sign-in page. */
export async function signInOnWeb(
  page: Page,
  user: DemoUser | { email: string; password: string },
): Promise<void> {
  const { email, password } =
    typeof user === 'string' ? { email: users[user], password: DEMO_PASSWORD } : user;
  await page.goto('/login');
  await page.getByLabel(f.email).fill(email);
  await page.getByLabel(f.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: authCopy.signIn.submit }).click();
  await expect(page).not.toHaveURL(/\/login/u);
}

/** A tiny PDF, enough for the document upload (type and size are checked). */
export const SAMPLE_PDF = {
  name: 'documento.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  ),
};
