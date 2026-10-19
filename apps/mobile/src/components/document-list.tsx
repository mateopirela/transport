import {
  documentExpirySchema,
  documentFileIssueMessages,
  fleetCopy,
  fleetErrorCopy,
  formatDate,
  requirementStateLabels,
  type DocumentOwnerType,
  type RequirementState,
} from '@transport/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { pickDocument, uploadDocument, type PickSource } from '../lib/document-upload';
import { ownerProgress, type CompanyContext } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { spacing } from '../theme';
import { Badge, Card, type Tone } from './fleet-ui';
import { Body, Button, Field, Notice } from './ui';

const STATE_TONES: Record<RequirementState, Tone> = {
  missing: 'warning',
  pending_review: 'info',
  approved: 'success',
  rejected: 'danger',
  expired: 'danger',
  suspended: 'danger',
};

const copy = fleetCopy.documents;

/**
 * Required documents of one owner (company, unit or operator) with their
 * state, and the actions to photograph or pick each one and send it.
 */
export function DocumentList({
  client,
  context,
  owner,
  onChanged,
  readOnly = false,
}: {
  client: Supabase;
  context: CompanyContext;
  owner: { type: DocumentOwnerType; id: string };
  onChanged: () => Promise<void>;
  /** Shows the state only, without the upload actions. */
  readOnly?: boolean;
}) {
  const progress = ownerProgress(context, owner);
  if (progress.length === 0) return <Body>{copy.empty}</Body>;
  return (
    <View style={styles.list}>
      {progress.map(({ requirement, document, state }) => (
        <Card
          key={requirement.id}
          title={requirement.name}
          subtitle={requirement.is_required ? copy.required : copy.optional}
        >
          <Badge label={requirementStateLabels[state]} tone={STATE_TONES[state]} />
          {state === 'rejected' && document?.review_notes ? (
            <Body>{copy.rejectionReason(document.review_notes)}</Body>
          ) : null}
          {state === 'approved' && document?.expires_at ? (
            <Body>{copy.validUntil(formatDate(document.expires_at))}</Body>
          ) : null}
          {!readOnly && state !== 'pending_review' ? (
            <UploadActions
              client={client}
              companyId={context.company.id}
              owner={owner}
              requirementId={requirement.id}
              requiresExpiry={requirement.requires_expiry}
              onUploaded={onChanged}
            />
          ) : null}
        </Card>
      ))}
    </View>
  );
}

function UploadActions({
  client,
  companyId,
  owner,
  requirementId,
  requiresExpiry,
  onUploaded,
}: {
  client: Supabase;
  companyId: string;
  owner: { type: DocumentOwnerType; id: string };
  requirementId: string;
  requiresExpiry: boolean;
  onUploaded: () => Promise<void>;
}) {
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState<PickSource | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  async function upload(source: PickSource) {
    setMessage(null);
    const expiry = validateForm(documentExpirySchema, expiresOn);
    if (!expiry.ok) {
      setMessage({ tone: 'danger', text: Object.values(expiry.errors)[0] ?? copy.expiryRequired });
      return;
    }
    if (requiresExpiry && !expiry.data) {
      setMessage({ tone: 'danger', text: copy.expiryRequired });
      return;
    }
    setBusy(source);
    try {
      const picked = await pickDocument(source);
      if (picked.status === 'denied') setMessage({ tone: 'danger', text: copy.cameraDenied });
      if (picked.status === 'invalid') {
        setMessage({ tone: 'danger', text: documentFileIssueMessages[picked.issue] });
      }
      if (picked.status !== 'picked') return;
      await uploadDocument(client, {
        companyId,
        ownerType: owner.type,
        ownerId: owner.id,
        requirementId,
        file: picked.file,
        expiresOn: expiry.data,
      });
      setMessage({ tone: 'info', text: copy.uploaded });
      await onUploaded();
    } catch (error) {
      setMessage({ tone: 'danger', text: fleetErrorMessage(error, fleetErrorCopy.uploadFailed) });
    } finally {
      setBusy(null);
    }
  }

  const sources: [PickSource, string][] = [
    ['camera', copy.takePhoto],
    ['library', copy.choosePhoto],
    ['pdf', copy.chooseFile],
  ];

  return (
    <View style={styles.actions}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {requiresExpiry ? (
        <Field
          label={copy.expiresOnLabel}
          placeholder="2027-12-31"
          value={expiresOn}
          onChangeText={setExpiresOn}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
        />
      ) : null}
      <View style={styles.row}>
        {sources.map(([source, label]) => (
          <View key={source} style={styles.flex}>
            <Button
              label={label}
              variant="secondary"
              loading={busy === source}
              disabled={busy !== null}
              onPress={() => void upload(source)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  actions: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
