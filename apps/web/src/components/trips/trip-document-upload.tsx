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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { registerTripDocument } from '@/lib/trips/actions';

const c = clientTripsCopy.documents.upload;
const ACCEPT = Object.keys(TRIP_DOCUMENT_MIME_TYPES).join(',');

/**
 * Uploads a trip document of the shipper (D22: the service order, or another
 * file) to the private `trip-documents` bucket (its policy checks the trip)
 * and registers it with add_trip_document, which checks the kind the shipper
 * side may upload. The action revalidates the trip page, so the checklist and
 * the file list refresh in the same response.
 */
export function TripDocumentUpload({
  tripId,
  kinds,
}: {
  tripId: string;
  /** Kinds the shipper may upload (trip_document_requirements), in order. */
  kinds: readonly TripDocumentKind[];
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

    const result = await registerTripDocument({
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
      className="space-y-3 rounded-xl border bg-card p-4"
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
      <p className="font-medium">{c.title}</p>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">{c.done}</Notice>}
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-kind`}>{c.kind}</Label>
          <select
            id={`${id}-kind`}
            name="kind"
            defaultValue={kinds[0]}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {tripDocumentKindLabels[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-file`}>{c.file}</Label>
          <Input id={`${id}-file`} name="file" type="file" accept={ACCEPT} required />
        </div>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? c.submitting : c.submit}
      </Button>
    </form>
  );
}
