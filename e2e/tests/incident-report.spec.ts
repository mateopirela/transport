import { expect, test, type Page } from '@playwright/test';
import { clientTripsCopy } from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Idempotency of the shipper's incident report (F4/F9): every submit of the
// same report carries the same clientEventId, so a double submit leaves one
// incident in the timeline, and a new report after a success is another one.
// Demo data: the MTY → GDL trip of Aceros del Norte (Ana), in `unloading`.

const c = clientTripsCopy;
const marker = `(e2e ${Date.now()})`;

/**
 * Records, in the page, the clientEventId of every request whose FormData
 * carries one (the report's server action; React prefixes the field name with
 * the argument index). Read in the browser, before the request leaves.
 */
async function recordReportKeys(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const keys: string[] = [];
    Object.assign(window, { __reportKeys: keys });
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (init?.body instanceof FormData) {
        for (const [name, value] of init.body.entries()) {
          if (/^(?:\d+_)?clientEventId$/u.test(name)) keys.push(String(value));
        }
      }
      return fetch(input, init);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __reportKeys: string[] }).__reportKeys);
}

/** Opens the report form (a <details>) and fills it. */
async function fillReport(page: Page, description: string) {
  const details = page.locator('details').filter({ hasText: c.incidents.report });
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open))) {
    await details.getByText(c.incidents.report).click();
  }
  await details.getByLabel(c.incidents.kind).selectOption('delay');
  await details.getByLabel(c.incidents.description).fill(description);
  return details.locator('form');
}

test('a double submit reports the incident once and the next report is another one', async ({
  page,
}) => {
  const reportKeys = await recordReportKeys(page);
  await signInOnWeb(page, 'ana');
  const timeline = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: c.timeline.title }) });
  const entries = (description: string) =>
    timeline.getByRole('listitem').filter({ hasText: description });
  const first = `Retraso en la caseta ${marker}`;
  const second = `Llanta ponchada ${marker}`;

  await test.step('submit the same report twice before the form re-renders', async () => {
    await page.goto(`/cliente/viajes/${ids.unloadingTrip}`);
    const form = await fillReport(page, first);
    // Both submits leave before React disables the button, as a fast double
    // click or a double tap would.
    await form.evaluate((element: HTMLFormElement) => {
      element.requestSubmit();
      element.requestSubmit();
    });
    await expect.poll(async () => (await reportKeys()).length).toBe(2);
    const [a, b] = await reportKeys();
    expect(a).toMatch(/^[0-9a-f-]{36}$/u);
    expect(b).toBe(a);
    await expect(page.getByText(c.incidents.sent)).toBeVisible();
    await expect(entries(first)).toHaveCount(1);
  });

  await test.step('a new report after the success is another incident', async () => {
    // Same page, no reload: the success itself starts the next attempt.
    const form = await fillReport(page, second);
    await form.getByRole('button', { name: c.incidents.submit }).click();
    await expect.poll(async () => (await reportKeys()).length).toBe(3);
    const [firstKey, , nextKey] = await reportKeys();
    expect(nextKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(nextKey).not.toBe(firstKey);
    await expect(entries(second)).toHaveCount(1);

    // What the database kept, not just what the page showed.
    await page.reload();
    await expect(entries(second)).toHaveCount(1);
    await expect(entries(first)).toHaveCount(1);
  });
});
