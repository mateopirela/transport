import { fleetCopy, formatDateTime, invitationUrl } from '@transport/shared';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { createInvitation, revokeInvitation, type OperatorSummary } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import type { Supabase } from '../lib/supabase';
import { colors, spacing } from '../theme';
import { SectionTitle } from './fleet-ui';
import { Body, Button, Notice } from './ui';

const copy = fleetCopy.invitation;
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL?.trim();

/**
 * The link to share: the web page `/invitacion/<token>` when the site URL is
 * configured (it opens the app or explains how to get it), otherwise the
 * deep link `transport://invitacion/<token>`.
 */
function shareableLink(token: string): string {
  if (SITE_URL) {
    try {
      return invitationUrl(SITE_URL, token);
    } catch {
      // Fall back to the deep link.
    }
  }
  return Linking.createURL(`/invitacion/${token}`);
}

/**
 * Invites the operator of this row (G2): issues a single-use link
 * (create_invitation) that the operator opens to create their account with
 * their phone. The plain token exists only in this screen's memory; the
 * database keeps its hash.
 */
export function InvitationSection({
  client,
  companyName,
  operator,
  onChanged,
}: {
  client: Supabase;
  companyName: string;
  /** Latest loaded operator; a new object after every successful refresh. */
  operator: OperatorSummary;
  onChanged: () => Promise<void>;
}) {
  const pending = operator.invitation;
  const [created, setCreated] = useState<{
    invitationId: string;
    token: string;
    expiresAt: string;
    /** The operator as loaded when the link was created. */
    loadedBefore: OperatorSummary;
  } | null>(null);
  // Show the link until a refresh says it is no longer the pending invitation
  // (replaced, cancelled or expired): then it can no longer be redeemed and
  // must not be shared. If the refresh after creating it fails, the link
  // stays visible.
  const issued =
    created && (operator === created.loadedBefore || pending?.id === created.invitationId)
      ? created
      : null;
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
    run('create', async () => {
      const invitation = await createInvitation(client, operator.id);
      setCreated({ ...invitation, loadedBefore: operator });
    });

  const revoke = (invitationId: string) =>
    run('revoke', async () => {
      await revokeInvitation(client, invitationId);
      setCreated(null);
    });

  function share(token: string) {
    void Share.share({ message: copy.shareMessage(companyName, shareableLink(token)) });
  }

  return (
    <View style={styles.section}>
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>{copy.subtitle}</Body>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {issued ? (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>{copy.link}</Text>
            <Text selectable style={styles.code} testID="invitation-link">
              {shareableLink(issued.token)}
            </Text>
            <Text style={styles.codeLabel}>
              {copy.validUntil(formatDateTime(issued.expiresAt))}
            </Text>
          </View>
          <Button label={copy.share} onPress={() => share(issued.token)} />
        </>
      ) : pending ? (
        <Notice tone="info" title={copy.validUntil(formatDateTime(pending.expires_at))}>
          {copy.pendingNoLink}
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
  code: { fontSize: 14, fontWeight: '600', color: colors.navy, textAlign: 'center' },
});
