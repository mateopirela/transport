import { adminCopy, onboardingStepsCopy } from '@transport/shared';

import { textLink } from '@/components/page-section';
import { adminDocumentFilePath } from '@/lib/routing';

const c = onboardingStepsCopy.identity;

/** The latest document of one requirement of the operator, with its file type. */
export interface IdentityDocument {
  id: string;
  mimeType: string | null;
}

function Figure({
  label,
  name,
  document,
}: {
  label: string;
  name: string;
  document: IdentityDocument | null;
}) {
  const href = document ? adminDocumentFilePath(document.id) : '';
  return (
    <figure className="space-y-2">
      <figcaption className="text-label text-text-dim">{label}</figcaption>
      {!document ? (
        <p className="flex aspect-[4/3] items-center justify-center border bg-surface text-subhead text-text-dim">
          {c.missing}
        </p>
      ) : document.mimeType?.startsWith('image/') ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          {/* A short-lived signed URL behind an admin-only redirect: next/image cannot optimize it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={c.imageAlt(label, name)}
            className="aspect-[4/3] w-full border bg-surface object-contain"
          />
        </a>
      ) : (
        <p className="space-y-1 border bg-surface p-4 text-subhead text-text-dim">
          <span className="block">{c.notAnImage}</span>
          <a href={href} target="_blank" rel="noopener noreferrer" className={textLink}>
            {adminCopy.document.view}
          </a>
        </p>
      )}
    </figure>
  );
}

/**
 * The operator's selfie next to their official id (D44): the admin compares
 * them by hand before approving; there is no automatic face match. Both
 * images come through the admin-only file route (aal2, R5).
 */
export function IdentityCompare({
  name,
  selfie,
  officialId,
}: {
  name: string;
  selfie: IdentityDocument | null;
  officialId: IdentityDocument | null;
}) {
  return (
    <section aria-label={c.title} className="space-y-3 border bg-cell p-4">
      <div className="space-y-0.5">
        <h3 className="text-headline text-text">{c.title}</h3>
        <p className="text-subhead text-text-dim">{c.hint}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Figure label={c.selfie} name={name} document={selfie} />
        <Figure label={c.officialId} name={name} document={officialId} />
      </div>
    </section>
  );
}
