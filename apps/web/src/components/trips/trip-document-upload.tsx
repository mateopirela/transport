'use client';

import {
  authErrors,
  clientTripsCopy,
  TRIP_DOCUMENT_MIME_TYPES,
  tripDocumentFileIssue,
  tripDocumentKindLabels,
  tripDocumentStoragePath,
  type TripDocumentKind,
} from '@transport/shared';
import { useId, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { registerTripDocument } from '@/lib/trips/actions';

const c = clientTripsCopy.documents.upload;
const ACCEPT = Object.keys(TRIP_DOCUMENT_MIME_TYPES).join(',');

/**
 * Uploads a trip document (D22) to the private `trip-documents` bucket (its
 * policy checks the trip) and registers it with add_trip_document, which
 * checks the kind the side may upload: the shipper's service order (B15) or,
 * in the carrier web (G10b), the Carta Porte, the invoice and the rest. The
 * action revalidates the trip page, so the checklist and the file list
 * refresh in the same response.
 */
export function TripDocumentUpload({
  tripId,
  kinds,
  registerAction = registerTripDocument,
  doneText = c.done,
}: {
  tripId: string;
  /** Kinds the viewer's side may upload (trip_document_requirements), in order. */
  kinds: readonly TripDocumentKind[];
  /** Server action of the area (the shipper's by default). */
  registerAction?: (input: unknown) => Promise<{ error?: string }>;
  /** Confirmation shown after a successful upload. */
  doneText?: string;
}) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get('file');
    const kind = data.get('kind');
    if (!(file instanceof File) || file.size === 0) return setError(c.chooseFile);
    const issue = tripDocumentFileIssue(file);
    if (issue) return setError(c.fileIssues[issue]);
    if (typeof kind !== 'string' || !(kinds as readonly string[]).includes(kind)) {
      return setError(clientTripsCopy.errors.generic);
    }
    const supabase = createBrowserSupabase();
    if (!supabase) return setError(authErrors.notConfigured);

    const storagePath = tripDocumentStoragePath({
      tripId,
      fileId: crypto.randomUUID(),
      mimeType: file.type,
    });
    const uploaded = await supabase.storage
      .from('trip-documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploaded.error) return setError(clientTripsCopy.errors.uploadFailed);

    const result = await registerAction({
      tripId,
      kind,
      storagePath,
      fileName: file.name,
    });
    if (result.error) return setError(result.error);
    setDone(true);
    form.reset();
  }

  if (kinds.length === 0) return null;

  return (
    <form
      className="space-y-4 rounded-2xl border bg-cell p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setError(null);
        setDone(false);
        setPending(true);
        upload(form)
          .catch(() => setError(clientTripsCopy.errors.uploadFailed))
          .finally(() => setPending(false));
      }}
    >
      <p className="text-headline text-text">{c.title}</p>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">{doneText}</Notice>}
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <Field label={c.kind} htmlFor={`${id}-kind`}>
          <Select id={`${id}-kind`} name="kind" defaultValue={kinds[0]}>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {tripDocumentKindLabels[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={c.file} htmlFor={`${id}-file`}>
          <Input
            id={`${id}-file`}
            name="file"
            type="file"
            accept={ACCEPT}
            required
            className="py-2.5 file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-accent-text"
          />
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending} loading={pending}>
        {pending ? c.submitting : c.submit}
      </Button>
    </form>
  );
}
