import {
  documentShareRevokeReasonLabels,
  formatDateTime,
  groupSharedDocuments,
  providerState,
  providerStateLabels,
  revokeShareErrorMessage,
  sharedDocumentsCopy,
  type ProviderState,
  type ProviderStatus,
  type SharedDocumentGroup,
  type SharedDocumentRow,
} from '@transport/shared';
import { useState } from 'react';
import { Alert } from 'react-native';

import { revokeDocumentShare } from '../lib/carrier-trips-api';
import type { Supabase } from '../lib/supabase';
import { Badge, Card, SectionTitle, type Tone } from './fleet-ui';
import { Body, Button, Notice } from './ui';

const copy = sharedDocumentsCopy;

const PROVIDER_TONES: Record<ProviderState, Tone> = {
  pending: 'neutral',
  approved: 'success',
  rejected: 'danger',
  revoked: 'danger',
};

function ownerTitle(group: SharedDocumentGroup): string {
  switch (group.ownerType) {
    case 'company':
      return copy.owner.company;
    case 'vehicle':
      return copy.owner.vehicle(group.ownerLabel);
    case 'operator':
      return copy.owner.operator(group.ownerLabel);
  }
}

function rowSubtitle(row: SharedDocumentRow): string {
  const status = row.active
    ? copy.carrier.active
    : copy.carrier.revoked(
        row.revoked_reason
          ? documentShareRevokeReasonLabels[row.revoked_reason]
          : copy.revokeFallback,
      );
  return [status, row.expires_at ? copy.expires(formatDateTime(row.expires_at)) : null]
    .filter(Boolean)
    .join(' · ');
}

function confirmRevoke(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(copy.carrier.revoke, copy.carrier.revokeConfirm, [
      { text: copy.carrier.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: copy.carrier.revoke, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/**
 * What the shipper of the trip sees of the carrier (G6, D21): the provider
 * status the shipper gave the company and the documents shared on the trip,
 * in force or revoked with the reason. The manager can stop sharing one.
 */
export function SharedDocumentsSection({
  client,
  rows,
  provider,
  canRevoke,
  onChanged,
}: {
  client: Supabase;
  rows: readonly SharedDocumentRow[];
  provider: { status: ProviderStatus; notes: string | null } | null;
  canRevoke: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const state = providerState(provider?.status);

  async function revoke(shareId: string) {
    if (!(await confirmRevoke())) return;
    setMessage(null);
    setBusy(shareId);
    try {
      await revokeDocumentShare(client, shareId);
      setMessage({ tone: 'info', text: copy.carrier.revokeDone });
      await onChanged();
    } catch (e) {
      setMessage({ tone: 'danger', text: revokeShareErrorMessage(e as { code?: string }) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <SectionTitle>{copy.provider.title}</SectionTitle>
      <Badge label={providerStateLabels[state]} tone={PROVIDER_TONES[state]} />
      {provider?.notes ? <Body>{provider.notes}</Body> : null}
      <SectionTitle>{copy.carrier.title}</SectionTitle>
      <Body>{copy.carrier.description}</Body>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {rows.length === 0 ? <Body>{copy.carrier.empty}</Body> : null}
      {groupSharedDocuments(rows).map((group) =>
        group.rows.map((row) => (
          <Card
            key={row.share_id}
            title={`${ownerTitle(group)} · ${row.requirement_name}`}
            subtitle={rowSubtitle(row)}
          >
            {canRevoke && row.active ? (
              <Button
                label={copy.carrier.revoke}
                variant="secondary"
                loading={busy === row.share_id}
                disabled={busy !== null}
                onPress={() => void revoke(row.share_id)}
              />
            ) : null}
          </Card>
        )),
      )}
    </>
  );
}
