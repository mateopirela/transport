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
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { registerDocument } from '@/lib/verification/actions';

const c = onboardingCopy.documents;
const ACCEPT = Object.keys(DOCUMENT_MIME_TYPES).join(',');

/**
 * Uploads a file to the private `documents` bucket (Storage policies check
 * the company folder) and then registers it with `submit_document`.
 */
export function DocumentUpload({
  companyId,
  ownerType,
  ownerId,
  requirementId,
  requiresExpiry,
  replacing,
}: {
  companyId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  requirementId: string;
  requiresExpiry: boolean;
  replacing: boolean;
}) {
  const id = useId();
  const router = useRouter();
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

    const result = await registerDocument({
      requirementId,
      ownerType,
      ownerId,
      storagePath,
      fileName: file.name,
      expiresOn: typeof expiresOn === 'string' && expiresOn ? expiresOn : undefined,
    });
    if (result.error) return setError(result.error);
    form.reset();
    setDone(true);
    router.refresh();
  }

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setError(null);
        setDone(false);
        setPending(true);
        upload(form)
          .catch(() => setError(onboardingCopy.errors.upload))
          .finally(() => setPending(false));
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">{c.uploaded}</Notice>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-file`}>{c.file}</Label>
          <Input id={`${id}-file`} name="file" type="file" accept={ACCEPT} required />
        </div>
        {requiresExpiry && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-expires`}>{c.expiresOn}</Label>
            <Input id={`${id}-expires`} name="expiresOn" type="date" required />
          </div>
        )}
      </div>
      <Button type="submit" variant={replacing ? 'outline' : 'accent'} size="sm" disabled={pending}>
        {pending ? c.uploading : replacing ? c.replace : c.upload}
      </Button>
    </form>
  );
}
