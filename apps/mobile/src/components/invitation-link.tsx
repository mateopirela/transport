import { formatDateTime, managerCompanyCopy } from '@transport/shared';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import type { IssuedInvitation } from '../lib/company-api';
import { companyErrorMessage } from '../lib/fleet-errors';
import { shareableLink } from '../lib/invitation-share';
import { colors, spacing } from '../theme';
import { Body, Button, Notice } from './ui';

const copy = managerCompanyCopy.invitationLink;

/**
 * Issues a single-use invitation link (G4: coordinator, new operator or
 * access reset) and offers it through the system share sheet. The plain
 * token lives only in this component's memory: once it unmounts the link
 * cannot be shown again (the database keeps its hash), so it says so.
 */
export function InvitationLinkIssuer({
  label,
  issue,
  shareMessage,
  disabled = false,
  onIssued,
}: {
  label: string;
  issue: () => Promise<IssuedInvitation>;
  shareMessage: (link: string) => string;
  disabled?: boolean;
  onIssued?: () => void;
}) {
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setIssued(await issue());
      onIssued?.();
    } catch (e) {
      setError(companyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const link = issued ? shareableLink(issued.token) : null;
  return (
    <View style={styles.section}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {issued && link ? (
        <>
          <View style={styles.box}>
            <Text style={styles.caption}>{copy.link}</Text>
            <Text selectable style={styles.link} testID="invitation-link">
              {link}
            </Text>
            <Text style={styles.caption}>{copy.validUntil(formatDateTime(issued.expiresAt))}</Text>
          </View>
          <Body>{copy.onlyOnce}</Body>
          <Button
            label={copy.share}
            onPress={() => void Share.share({ message: shareMessage(link) })}
          />
        </>
      ) : null}
      <Button
        label={issued ? copy.generate : label}
        variant={issued ? 'secondary' : 'primary'}
        onPress={() => void generate()}
        loading={busy}
        disabled={disabled || busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  box: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  caption: { fontSize: 13, color: colors.textMuted },
  link: { fontSize: 14, fontWeight: '600', color: colors.navy, textAlign: 'center' },
});
