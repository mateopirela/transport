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
import { Fragment, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { revokeDocumentShare } from '../lib/carrier-trips-api';
import type { Supabase } from '../lib/supabase';
import { spacing, useTheme } from '../theme';
import { ConfirmSheet, type ConfirmSheetHandle } from './sheet';
import {
  Button,
  Cell,
  Footnote,
  Group,
  Notice,
  SectionHeader,
  TextCell,
  type PillTone,
} from './ui';

const copy = sharedDocumentsCopy;

const PROVIDER_TONES: Record<ProviderState, PillTone> = {
  pending: 'neutral',
  approved: 'ok',
  rejected: 'red',
  revoked: 'red',
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
  const { type } = useTheme();
  const confirmSheet = useRef<ConfirmSheetHandle>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const state = providerState(provider?.status);

  async function revoke(shareId: string) {
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

  function confirmRevoke(shareId: string) {
    confirmSheet.current?.ask({
      title: copy.carrier.revoke,
      body: copy.carrier.revokeConfirm,
      confirmLabel: copy.carrier.revoke,
      cancelLabel: copy.carrier.cancel,
      destructive: true,
      onConfirm: () => revoke(shareId),
    });
  }

  return (
    <>
      <SectionHeader title={copy.provider.title} />
      <Group>
        <Cell
          title={copy.provider.status}
          subtitle={provider?.notes}
          pill={{ label: providerStateLabels[state], tone: PROVIDER_TONES[state] }}
        />
      </Group>
      <SectionHeader title={copy.carrier.title} />
      {message ? (
        <Notice tone={message.tone === 'info' ? 'highlight' : 'danger'}>{message.text}</Notice>
      ) : null}
      {rows.length === 0 ? (
        <Group>
          <TextCell tone="dim">{copy.carrier.empty}</TextCell>
        </Group>
      ) : (
        <Group>
          {groupSharedDocuments(rows).map((group) => (
            <Fragment key={`${group.ownerType}-${group.ownerLabel}`}>
              {group.rows.map((row) => (
                <Cell key={row.share_id}>
                  <Text style={type.body}>{`${ownerTitle(group)} · ${row.requirement_name}`}</Text>
                  <Text style={type.footnote}>{rowSubtitle(row)}</Text>
                  {canRevoke && row.active ? (
                    <View style={styles.action}>
                      <Button
                        label={copy.carrier.revoke}
                        variant="secondary"
                        size="small"
                        loading={busy === row.share_id}
                        disabled={busy !== null}
                        onPress={() => confirmRevoke(row.share_id)}
                      />
                    </View>
                  ) : null}
                </Cell>
              ))}
            </Fragment>
          ))}
        </Group>
      )}
      <Footnote>{copy.carrier.description}</Footnote>
      <ConfirmSheet ref={confirmSheet} />
    </>
  );
}

const styles = StyleSheet.create({ action: { marginTop: spacing.sm, alignItems: 'flex-start' } });
