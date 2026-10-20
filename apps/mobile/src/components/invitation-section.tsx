import { fleetCopy, formatDateTime } from '@transport/shared';
import { useState } from 'react';
import { Share, StyleSheet, Text } from 'react-native';

import { createInvitation, revokeInvitation, type OperatorSummary } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { shareableLink } from '../lib/invitation-share';
import type { Supabase } from '../lib/supabase';
import { lookOf, useTheme, type Look } from '../theme';
import { Button, ControlCell, Footnote, Group, Notice, SectionHeader, TextCell } from './ui';

const copy = fleetCopy.invitation;

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
  const styles = STYLES[useTheme().theme];
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
    <>
      <SectionHeader title={copy.title} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {issued ? (
        <>
          <Group>
            <ControlCell label={copy.link}>
              <Text selectable style={styles.code} testID="invitation-link">
                {shareableLink(issued.token)}
              </Text>
            </ControlCell>
            <TextCell tone="dim">{copy.validUntil(formatDateTime(issued.expiresAt))}</TextCell>
          </Group>
          <Button label={copy.share} icon="share" onPress={() => share(issued.token)} />
        </>
      ) : pending ? (
        <Notice tone="info" title={copy.validUntil(formatDateTime(pending.expires_at))}>
          {copy.pendingNoLink}
        </Notice>
      ) : null}
      <Footnote>{copy.subtitle}</Footnote>
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
          variant="plain"
          onPress={() => void revoke(pending.id)}
          loading={busy === 'revoke'}
          disabled={busy !== null}
        />
      ) : null}
    </>
  );
}

function makeStyles({ type }: Look) {
  return StyleSheet.create({ code: { ...type.body, fontFamily: type.headline.fontFamily } });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
