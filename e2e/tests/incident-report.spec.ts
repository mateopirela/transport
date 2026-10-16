import { expect, test, type Page, type Request } from '@playwright/test';
import { clientTripsCopy } from '@transport/shared';

import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// Idempotency of the shipper's incident report (F4/F9): every submit of the
// same report carries the same clientEventId, so a double submit leaves one
// incident in the timeline, and a new report after a success is another one.
// Demo data: the MTY → GDL trip of Aceros del Norte (Ana), in `unloading`.

const c = clientTripsCopy;
const marker = `(e2e ${Date.now()})`;

/** The clientEventId field of a server action request (multipart FormData). */
function clientEventIdOf(request: Request): string | undefined {
  const body = request.postData() ?? '';
  return /name="(?:\d+_)?clientEventId"\r\n\r\n([0-9a-f-]{36})/u.exec(body)?.[1];
}

/** Records the server action requests that send one of this run's reports. */
function recordReports(page: Page, marker: string): Request[] {
  const reports: Request[] = [];
  page.on('requestfinished', (request) => {
    if (
      request.method() === 'POST' &&
      request.headers()['next-action'] &&
      request.postData()?.includes(marker)
    ) {
      reports.push(request);
    }
  });
  return reports;
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
  await signInOnWeb(page, 'ana');
  const reports = recordReports(page, marker);
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
    await expect.poll(() => reports.length).toBe(2);
    const [a, b] = reports.map(clientEventIdOf);
    expect(a).toBeDefined();
    expect(b).toBe(a);
    await expect(page.getByText(c.incidents.sent)).toBeVisible();
    await expect(entries(first)).toHaveCount(1);
  });

  await test.step('a new report after the success is another incident', async () => {
    // Same page, no reload: the success itself starts the next attempt.
    const form = await fillReport(page, second);
    await form.getByRole('button', { name: c.incidents.submit }).click();
    await expect.poll(() => reports.length).toBe(3);
    const [firstKey, , nextKey] = reports.map(clientEventIdOf);
    expect(nextKey).toBeDefined();
    expect(nextKey).not.toBe(firstKey);
    await expect(entries(second)).toHaveCount(1);

    // What the database kept, not just what the page showed.
    await page.reload();
    await expect(entries(second)).toHaveCount(1);
    await expect(entries(first)).toHaveCount(1);
  });
});
