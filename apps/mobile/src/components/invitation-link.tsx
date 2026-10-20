import { formatDateTime, managerCompanyCopy } from '@transport/shared';
import { useState } from 'react';
import { Share, StyleSheet, Text } from 'react-native';

import type { IssuedInvitation } from '../lib/company-api';
import { companyErrorMessage } from '../lib/fleet-errors';
import { shareableLink } from '../lib/invitation-share';
import { lookOf, useTheme, type Look } from '../theme';
import { Button, ControlCell, Footnote, Group, Notice, TextCell } from './ui';

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
  replacesPrevious = false,
  onIssued,
}: {
  label: string;
  /** The link replaces the previous one (an existing operator's), which stops working. */
  replacesPrevious?: boolean;
  issue: () => Promise<IssuedInvitation>;
  shareMessage: (link: string) => string;
  disabled?: boolean;
  onIssued?: () => void;
}) {
  const styles = STYLES[useTheme().theme];
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
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {issued && link ? (
        <>
          <Group>
            <ControlCell label={copy.link}>
              <Text selectable style={styles.link} testID="invitation-link">
                {link}
              </Text>
            </ControlCell>
            <TextCell tone="dim">{copy.validUntil(formatDateTime(issued.expiresAt))}</TextCell>
          </Group>
          <Footnote>{replacesPrevious ? copy.onlyOnceReplaces : copy.onlyOnce}</Footnote>
          <Button
            label={copy.share}
            icon="share"
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
    </>
  );
}

function makeStyles({ type }: Look) {
  return StyleSheet.create({ link: { ...type.body, fontFamily: type.headline.fontFamily } });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
