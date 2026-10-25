import { tripLinkCopy, tripLinkMessage } from '@transport/shared';
import { useState } from 'react';
import { Share } from 'react-native';

import type { Supabase } from '../lib/supabase';
import { createTripLink } from '../lib/trip-link-api';
import { Cell, Footnote, Group, Notice, SectionHeader } from './ui';

const copy = tripLinkCopy.send;

/**
 * "Enviar viaje al operador" (H2, D29): issues the trip link (revoking the
 * previous one) and opens the system share sheet with the message for the
 * operator, so it goes by WhatsApp, SMS or whatever they use. The link only
 * opens with the operator's session, and stops working when the operator
 * changes, the trip ends or after 30 days.
 */
export function TripLinkSection({
  client,
  tripId,
  operatorName,
  route,
}: {
  client: Supabase;
  tripId: string;
  operatorName: string;
  route: string;
}) {
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function send() {
    if (sending) return;
    setSending(true);
    setFailed(false);
    try {
      const url = await createTripLink(client, tripId);
      await Share.share({ message: tripLinkMessage({ operatorName, route, url }) });
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SectionHeader title={copy.title} />
      {failed ? <Notice tone="danger">{copy.failed}</Notice> : null}
      <Group>
        <Cell
          icon="send"
          title={sending ? copy.preparing : copy.share}
          role="button"
          strong
          onPress={() => void send()}
        />
      </Group>
      <Footnote>{copy.description(operatorName)}</Footnote>
    </>
  );
}
