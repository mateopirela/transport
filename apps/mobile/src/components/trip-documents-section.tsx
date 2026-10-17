import {
  canAddTripDocuments,
  carrierTripsCopy,
  formatDateTime,
  tripDocumentFileIssue,
  tripDocumentKindLabels,
  toOptions,
  type TripChecklistRow,
  type TripDocumentKind,
  type TripStatus,
} from '@transport/shared';
import * as Linking from 'expo-linking';
import { useState } from 'react';

import { carrierTripErrorMessage } from '../lib/carrier-trip-errors';
import { tripDocumentUrl, uploadTripDocument, type TripDocument } from '../lib/carrier-trips-api';
import { pickDocument, type PickOutcome, type PickSource } from '../lib/document-upload';
import type { Supabase } from '../lib/supabase';
import { Card, ChoiceChips, SectionTitle } from './fleet-ui';
import { TripChecklist } from './trip-checklist';
import { Body, Button, Notice } from './ui';

const copy = carrierTripsCopy.documents;

const SOURCES: { source: PickSource; label: string }[] = [
  { source: 'pdf', label: copy.uploadPdf },
  { source: 'camera', label: copy.uploadCamera },
  { source: 'library', label: copy.uploadLibrary },
];

/**
 * Documents of the trip (B20, D22): the checklist of what the trip needs by
 * stage, the files uploaded so far and the upload of the kinds the carrier
 * side registers (service order, Carta Porte, invoice, others). The shipper
 * uploads the service order from the web; the operator reads them. D09: they
 * are only stored, never issued or validated.
 */
export function TripDocumentsSection({
  client,
  tripId,
  status,
  documents,
  checklist,
  uploadableKinds,
  onChanged,
}: {
  client: Supabase;
  tripId: string;
  status: TripStatus;
  documents: readonly TripDocument[];
  checklist: readonly TripChecklistRow[];
  /** Kinds the carrier may upload (trip_document_requirements), in order. */
  uploadableKinds: readonly TripDocumentKind[];
  onChanged: () => Promise<void>;
}) {
  const [kind, setKind] = useState<TripDocumentKind | undefined>(uploadableKinds[0]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  async function upload(source: PickSource) {
    if (!kind) return;
    setMessage(null);
    let picked: PickOutcome;
    try {
      // The trip-documents bucket rules (15 MB, PDF or image), not the company documents' ones.
      picked = await pickDocument(source, tripDocumentFileIssue);
    } catch {
      setMessage({ tone: 'danger', text: copy.pickFailed });
      return;
    }
    if (picked.status === 'cancelled') return;
    if (picked.status === 'denied') {
      setMessage({ tone: 'danger', text: copy.cameraDenied });
      return;
    }
    if (picked.status === 'invalid') {
      setMessage({ tone: 'danger', text: copy.fileIssues[picked.issue] });
      return;
    }
    setBusy(true);
    try {
      await uploadTripDocument(client, { tripId, kind, file: picked.file });
      setMessage({ tone: 'info', text: copy.uploaded });
      await onChanged();
    } catch (e) {
      setMessage({ tone: 'danger', text: carrierTripErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function open(document: TripDocument) {
    try {
      await Linking.openURL(await tripDocumentUrl(client, document.storage_path));
    } catch {
      setMessage({ tone: 'danger', text: copy.openFailed });
    }
  }

  const canAdd = canAddTripDocuments(status) && uploadableKinds.length > 0;
  return (
    <>
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>{copy.help}</Body>
      <TripChecklist rows={checklist} />
      <SectionTitle>{copy.files}</SectionTitle>
      {documents.length === 0 ? <Body>{copy.empty}</Body> : null}
      {documents.map((d) => (
        <Card
          key={d.id}
          title={tripDocumentKindLabels[d.kind]}
          subtitle={`${d.file_name} · ${copy.uploadedAt(formatDateTime(d.created_at))}`}
          onPress={() => void open(d)}
        />
      ))}
      {canAdd ? (
        <>
          <ChoiceChips
            label={copy.kind}
            options={toOptions(uploadableKinds, tripDocumentKindLabels)}
            value={kind}
            onChange={setKind}
          />
          {SOURCES.map(({ source, label }) => (
            <Button
              key={source}
              label={busy ? copy.uploading : label}
              variant="secondary"
              disabled={busy || !kind}
              onPress={() => void upload(source)}
            />
          ))}
        </>
      ) : canAddTripDocuments(status) ? null : (
        <Body>{copy.cancelled}</Body>
      )}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </>
  );
}
