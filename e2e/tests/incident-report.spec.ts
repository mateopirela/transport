import { expect, test, type Locator, type Page } from '@playwright/test';
import { clientTripsCopy } from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Idempotency of the shipper's incident report (F4/F9): every submit of the
// same report carries the same clientEventId, so a double submit leaves one
// incident in the timeline, and a new report after a success is another one.
// Demo data: the MTY → GDL trip of Aceros del Norte (Ana), in `unloading`.

const c = clientTripsCopy;
const marker = `(e2e ${Date.now()})`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Counts the form posts of a page: server actions whose body is the form's
 * FormData (multipart). Other actions of the trip page, such as marking the
 * chat as read, send a plain-text body.
 */
function countFormPosts(page: Page, pathname: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    const headers = request.headers();
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === pathname &&
      headers['next-action'] &&
      headers['content-type']?.startsWith('multipart/form-data')
    ) {
      count += 1;
    }
  });
  return () => count;
}

/** Opens the report form (a <details>) and fills it. */
async function fillReport(page: Page, description: string): Promise<Locator> {
  const details = page.locator('details').filter({ hasText: c.incidents.report });
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open))) {
    await details.getByText(c.incidents.report).click();
  }
  await details.getByLabel(c.incidents.kind).selectOption('delay');
  await details.getByLabel(c.incidents.description).fill(description);
  return details.locator('form');
}

/** The idempotency key the form sends (its hidden clientEventId field). */
const keyOf = (form: Locator) =>
  form.locator('input[name="clientEventId"]').inputValue({ timeout: 5_000 });

test('a double submit reports the incident once and the next report is another one', async ({
  page,
}) => {
  const tripPath = `/cliente/viajes/${ids.unloadingTrip}`;
  const formPosts = countFormPosts(page, tripPath);
  await signInOnWeb(page, 'ana');
  const timeline = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: c.timeline.title }) });
  const entries = (description: string) =>
    timeline.getByRole('listitem').filter({ hasText: description });
  const first = `Retraso en la caseta ${marker}`;
  const second = `Llanta ponchada ${marker}`;
  let firstKey = '';

  await test.step('submit the same report twice before the form re-renders', async () => {
    await page.goto(tripPath);
    const form = await fillReport(page, first);
    firstKey = await keyOf(form);
    expect(firstKey).toMatch(UUID);
    // Both submits leave before React disables the button, as a fast double
    // click or a double tap would, so both carry the same key.
    await form.evaluate((element: HTMLFormElement) => {
      element.requestSubmit();
      element.requestSubmit();
    });
    // Both reached the server; the second one returned the same incident.
    await expect.poll(formPosts).toBe(2);
    await expect(page.getByText(c.incidents.sent)).toBeVisible();
    await expect(entries(first)).toHaveCount(1);
  });

  await test.step('a new report after the success is another incident', async () => {
    // Same page, no reload: the success itself starts the next attempt.
    const form = await fillReport(page, second);
    const nextKey = await keyOf(form);
    expect(nextKey).toMatch(UUID);
    expect(nextKey).not.toBe(firstKey);
    await form.getByRole('button', { name: c.incidents.submit }).click();
    await expect.poll(formPosts).toBe(3);
    await expect(entries(second)).toHaveCount(1);

    // What the database kept, not just what the page showed.
    await page.reload();
    await expect(entries(second)).toHaveCount(1);
    await expect(entries(first)).toHaveCount(1);
  });
});
