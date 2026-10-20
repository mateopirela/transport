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
import { useRef, useState } from 'react';

import { pickDocument, uploadDocument, type PickSource } from '../lib/document-upload';
import { ownerProgress, type CompanyContext } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import type { IconName } from './icons';
import { Sheet, type SheetHandle } from './sheet';
import { StatusRow } from './status-row';
import {
  Cell,
  ErrorText,
  FieldCell,
  Group,
  groupInset,
  Notice,
  TextCell,
  type PillTone,
} from './ui';

const STATE_TONES: Record<RequirementState, PillTone> = {
  missing: 'amber',
  pending_review: 'accent',
  approved: 'ok',
  rejected: 'red',
  expired: 'red',
  suspended: 'red',
};

const copy = fleetCopy.documents;

const SOURCES: [PickSource, string, IconName][] = [
  ['camera', copy.takePhoto, 'camera'],
  ['library', copy.choosePhoto, 'image'],
  ['pdf', copy.chooseFile, 'document'],
];

/** The requirement a sheet sends a file for. */
interface Target {
  requirementId: string;
  name: string;
  requiresExpiry: boolean;
}

/**
 * Required documents of one owner (company, unit or operator) as a group,
 * each with its state; tapping one that can be sent opens a sheet to
 * photograph or pick it (and write its expiry date) and send it.
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
  const sheet = useRef<SheetHandle>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [sent, setSent] = useState(false);
  const progress = ownerProgress(context, owner);
  if (progress.length === 0) {
    return (
      <Group>
        <TextCell tone="dim">{copy.empty}</TextCell>
      </Group>
    );
  }
  return (
    <>
      {sent ? <Notice>{copy.uploaded}</Notice> : null}
      <Group>
        {progress.map(({ requirement, document, state }) => {
          const uploadable = !readOnly && state !== 'pending_review';
          return (
            <StatusRow
              key={requirement.id}
              title={requirement.name}
              lines={[
                requirement.is_required ? copy.required : copy.optional,
                state === 'rejected' && document?.review_notes
                  ? copy.rejectionReason(document.review_notes)
                  : null,
                state === 'approved' && document?.expires_at
                  ? copy.validUntil(formatDate(document.expires_at))
                  : null,
              ]}
              pill={{ label: requirementStateLabels[state], tone: STATE_TONES[state] }}
              onPress={
                uploadable
                  ? () => {
                      setSent(false);
                      setTarget({
                        requirementId: requirement.id,
                        name: requirement.name,
                        requiresExpiry: requirement.requires_expiry,
                      });
                      sheet.current?.open();
                    }
                  : undefined
              }
            />
          );
        })}
      </Group>
      <Sheet ref={sheet} title={target?.name} onClose={() => setTarget(null)}>
        {target ? (
          <UploadActions
            key={target.requirementId}
            client={client}
            companyId={context.company.id}
            owner={owner}
            target={target}
            onUploaded={async () => {
              sheet.current?.close();
              setSent(true);
              await onChanged();
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function UploadActions({
  client,
  companyId,
  owner,
  target,
  onUploaded,
}: {
  client: Supabase;
  companyId: string;
  owner: { type: DocumentOwnerType; id: string };
  target: Target;
  onUploaded: () => Promise<void>;
}) {
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState<PickSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(source: PickSource) {
    setError(null);
    const expiry = validateForm(documentExpirySchema, expiresOn);
    if (!expiry.ok) {
      setError(Object.values(expiry.errors)[0] ?? copy.expiryRequired);
      return;
    }
    if (target.requiresExpiry && !expiry.data) {
      setError(copy.expiryRequired);
      return;
    }
    setBusy(source);
    try {
      const picked = await pickDocument(source);
      if (picked.status === 'denied') setError(copy.cameraDenied);
      if (picked.status === 'invalid') setError(documentFileIssueMessages[picked.issue]);
      if (picked.status !== 'picked') return;
      await uploadDocument(client, {
        companyId,
        ownerType: owner.type,
        ownerId: owner.id,
        requirementId: target.requirementId,
        file: picked.file,
        expiresOn: expiry.data,
      });
      await onUploaded();
    } catch (e) {
      setError(fleetErrorMessage(e, fleetErrorCopy.uploadFailed));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {target.requiresExpiry ? (
        <Group>
          <FieldCell
            inSheet
            label={copy.expiresOnLabel}
            placeholder="2027-12-31"
            value={expiresOn}
            onChangeText={setExpiresOn}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
        </Group>
      ) : null}
      <Group inset={groupInset.icon}>
        {SOURCES.map(([source, label, icon]) => (
          <Cell
            key={source}
            icon={icon}
            title={busy === source ? copy.uploading : label}
            disabled={busy !== null}
            onPress={() => void upload(source)}
          />
        ))}
      </Group>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </>
  );
}
