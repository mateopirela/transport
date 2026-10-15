import { fleetCopy, formatDateTime, formatInvitationCode } from '@transport/shared';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { createInvitation, revokeInvitation, type InvitationRow } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import type { Supabase } from '../lib/supabase';
import { colors, spacing } from '../theme';
import { SectionTitle } from './fleet-ui';
import { Body, Button, Notice } from './ui';

const copy = fleetCopy.invitation;

/**
 * Invites an operator (D15): issues a single-use code bound to its email and
 * shares the link `transport://invite?code=…` (or the code to type). The plain
 * code exists only in this screen's memory; the database keeps its hash.
 */
export function InvitationSection({
  client,
  companyName,
  operatorId,
  pending,
  onChanged,
}: {
  client: Supabase;
  companyName: string;
  operatorId: string;
  pending: InvitationRow | null;
  onChanged: () => Promise<void>;
}) {
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'create' | 'revoke', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(fleetErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const create = () =>
    run('create', async () => setIssued(await createInvitation(client, operatorId)));

  const revoke = (invitationId: string) =>
    run('revoke', async () => {
      await revokeInvitation(client, invitationId);
      setIssued(null);
    });

  function share(code: string) {
    const link = Linking.createURL('/invite', { queryParams: { code } });
    void Share.share({
      message: copy.shareMessage(companyName, link, formatInvitationCode(code)),
    });
  }

  return (
    <View style={styles.section}>
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>{copy.subtitle}</Body>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {issued ? (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>{copy.code}</Text>
            <Text selectable style={styles.code}>
              {formatInvitationCode(issued.code)}
            </Text>
            <Text style={styles.codeLabel}>
              {copy.validUntil(formatDateTime(issued.expiresAt))}
            </Text>
          </View>
          <Button label={copy.share} onPress={() => share(issued.code)} />
        </>
      ) : pending ? (
        <Notice tone="info" title={copy.validUntil(formatDateTime(pending.expires_at))}>
          {copy.pendingNoCode}
        </Notice>
      ) : null}
      <Button
        label={issued || pending ? copy.recreate : copy.create}
        variant={issued ? 'secondary' : 'primary'}
        onPress={() => void create()}
        loading={busy === 'create'}
        disabled={busy !== null}
      />
      {pending ? (
        <Button
          label={copy.revoke}
          variant="link"
          onPress={() => void revoke(pending.id)}
          loading={busy === 'revoke'}
          disabled={busy !== null}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  codeBox: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  codeLabel: { fontSize: 13, color: colors.textMuted },
  code: { fontSize: 24, fontWeight: '700', letterSpacing: 2, color: colors.navy },
});
