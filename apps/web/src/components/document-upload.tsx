'use client';

import {
  authErrors,
  DOCUMENT_MIME_TYPES,
  documentFileIssue,
  documentFileIssueMessages,
  documentStoragePath,
  onboardingCopy,
  type DocumentOwnerType,
} from '@transport/shared';
import { useId, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { registerDocument } from '@/lib/verification/actions';

const c = onboardingCopy.documents;
const ACCEPT = Object.keys(DOCUMENT_MIME_TYPES).join(',');

/**
 * Uploads a file to the private `documents` bucket (Storage policies check
 * the company folder) and then registers it with `submit_document`.
 * registerDocument revalidates the review page (the carrier's fleet screens,
 * G10b, pass their own action), and a server action that revalidates the
 * current page brings its new tree in the same response, so no
 * router.refresh() is needed (it would only render the page again).
 */
export function DocumentUpload({
  companyId,
  ownerType,
  ownerId,
  requirementId,
  requiresExpiry,
  replacing,
  registerAction = registerDocument,
}: {
  companyId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  requirementId: string;
  requiresExpiry: boolean;
  replacing: boolean;
  /** Server action that registers the uploaded file (the shipper's by default). */
  registerAction?: (input: unknown) => Promise<{ error?: string }>;
}) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get('file');
    const expiresOn = data.get('expiresOn');
    if (!(file instanceof File) || file.size === 0) return setError(c.chooseFile);
    const issue = documentFileIssue(file);
    if (issue) return setError(documentFileIssueMessages[issue]);
    if (requiresExpiry && !expiresOn) return setError(onboardingCopy.errors.expiryRequired);
    const supabase = createBrowserSupabase();
    if (!supabase) return setError(authErrors.notConfigured);

    const storagePath = documentStoragePath({
      companyId,
      ownerType,
      ownerId,
      fileId: crypto.randomUUID(),
      mimeType: file.type,
    });
    const uploaded = await supabase.storage
      .from('documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploaded.error) return setError(onboardingCopy.errors.upload);

    const result = await registerAction({
      requirementId,
      ownerType,
      ownerId,
      storagePath,
      fileName: file.name,
      expiresOn: typeof expiresOn === 'string' && expiresOn ? expiresOn : undefined,
    });
    if (result.error) return setError(result.error);
    setDone(true);
  }

  // Once registered, the requirement is pending review and the revalidated
  // page drops this form. Until it lands, show only the confirmation:
  // resetting the form to idle (empty input, "upload" button) would invite a
  // second upload and could be mistaken for the next document's form.
  if (done) return <Notice tone="success">{c.uploaded}</Notice>;

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setError(null);
        setPending(true);
        upload(form)
          .catch(() => setError(onboardingCopy.errors.upload))
          .finally(() => setPending(false));
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
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
        {requiresExpiry && (
          <Field label={c.expiresOn} htmlFor={`${id}-expires`}>
            <Input id={`${id}-expires`} name="expiresOn" type="date" required />
          </Field>
        )}
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending} loading={pending}>
        {pending ? c.uploading : replacing ? c.replace : c.upload}
      </Button>
    </form>
  );
}
