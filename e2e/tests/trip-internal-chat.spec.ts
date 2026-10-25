import { expect, test } from '@playwright/test';
import {
  carrierTripGroup,
  carrierWebCopy,
  chatCopy,
  internalChatCopy,
  QUICK_REPORTS,
} from '@transport/shared';

import { findTrip, signInAs } from '../support/actors';
import { ids } from '../support/demo';
import { signInOnWeb } from '../support/web';

// H1 (D28), the acceptance of the block on the seed: Pedro reports to his
// coordinator from the app (here, through the same RPCs), Andrea reads it in
// the "Interno" tab of the trip in the web and answers; Ana, the shipper of
// the trip, never sees that conversation; Héctor (another business unit)
// does not open the trip. Demo data: supabase/seed.sql. The trip may have
// been delivered by return-trip.spec.ts already: its chat stays the same.

const ANSWER = 'Pedro, ¿ya te firmaron la remisión?';
const REPORT = QUICK_REPORTS[3];

test('the operator reports to his coordinator in the internal chat, which the shipper never sees', async ({
  browser,
}) => {
  await test.step('Pedro sends a quick report from the app', async () => {
    const pedro = await signInAs('pedro');
    const { data: conversation, error } = await pedro
      .from('conversations')
      .select('id')
      .eq('trip_id', ids.unloadingTrip)
      .eq('kind', 'trip_internal')
      .single();
    if (error) throw new Error(error.message);
    const sent = await pedro.rpc('send_message', {
      p_conversation_id: conversation.id,
      p_body: REPORT,
    });
    if (sent.error) throw new Error(sent.error.message);
    // And no longer writes to the shipper (D28).
    const { data: shipperChat } = await pedro
      .from('conversations')
      .select('id')
      .eq('trip_id', ids.unloadingTrip)
      .eq('kind', 'trip');
    expect(shipperChat).toEqual([]);
  });

  // Its tab of the trips list: open, or the history once delivered.
  const pedro = await signInAs('pedro');
  const { status } = await findTrip(pedro, { tripId: ids.unloadingTrip });
  const list =
    carrierTripGroup(status) === 'history'
      ? '/transportista/viajes?vista=historial'
      : '/transportista/viajes';

  const andreaContext = await browser.newContext();
  const andrea = await andreaContext.newPage();
  await test.step('Andrea sees the unread report in her trips and answers in "Interno"', async () => {
    await signInOnWeb(andrea, 'andrea');
    await andrea.goto(list);
    const badge = andrea.getByRole('link', { name: /mensajes? internos? sin leer/u }).first();
    await expect(badge).toBeVisible();
    await badge.click();
    await expect(andrea).toHaveURL(/chat=interno/u);
    await expect(
      andrea.getByRole('link', { name: internalChatCopy.tabs.internal }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(andrea.getByText(REPORT).first()).toBeVisible();
    await expect(andrea.getByText(internalChatCopy.staffDescription)).toBeVisible();
    await andrea.getByPlaceholder(chatCopy.placeholder).fill(ANSWER);
    await andrea.getByRole('button', { name: chatCopy.send, exact: true }).click();
    await expect(andrea.getByText(ANSWER).first()).toBeVisible();

    // The "Cliente" tab is the chat with Ana, without the internal messages.
    await andrea.getByRole('link', { name: internalChatCopy.tabs.shipper }).click();
    await expect(andrea).not.toHaveURL(/chat=interno/u);
    await expect(andrea.getByText(ANSWER)).toHaveCount(0);
  });

  await test.step('Ana, the shipper, never sees the internal conversation', async () => {
    const anaContext = await browser.newContext();
    const ana = await anaContext.newPage();
    await signInOnWeb(ana, 'ana');
    await ana.goto(`/cliente/viajes/${ids.unloadingTrip}`);
    await expect(ana.getByText('Gracias, Pedro. Avísame cuando terminen.')).toBeVisible();
    await expect(ana.getByText(ANSWER)).toHaveCount(0);
    await expect(ana.getByText(REPORT)).toHaveCount(0);
    await expect(ana.getByRole('link', { name: internalChatCopy.tabs.internal })).toHaveCount(0);
    // Not through the API either (RLS).
    const client = await signInAs('ana');
    const { data } = await client
      .from('conversations')
      .select('id')
      .eq('trip_id', ids.unloadingTrip)
      .eq('kind', 'trip_internal');
    expect(data).toEqual([]);
    await anaContext.close();
  });

  await test.step('Héctor, of another business unit, does not open the trip', async () => {
    const hectorContext = await browser.newContext();
    const hector = await hectorContext.newPage();
    await signInOnWeb(hector, 'hector');
    await hector.goto(`/transportista/viajes/${ids.unloadingTrip}?chat=interno`);
    await expect(hector.getByText(carrierWebCopy.trips.errors.notFound)).toBeVisible();
    await expect(hector.getByText(REPORT)).toHaveCount(0);
    await hectorContext.close();
  });

  await andreaContext.close();
});
