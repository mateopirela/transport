import { legalCopy, type LegalText } from '@transport/shared';
import Link from 'next/link';

import { PublicHeader, publicHeaderLink } from '@/components/public-header';
import { Notice } from '@/components/ui/notice';
import { paths } from '@/lib/routing';

/**
 * Public legal page (B27): privacy notice or terms, readable without a
 * session. The brand bar on Night with the two documents, then one reading
 * column on the page: the version as a label, the title, and each section
 * numbered in mono and parted by a hairline (docs/plan-fulmis.md §2 V5).
 */
export function LegalDocument({ text }: { text: LegalText }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader>
        <nav className="flex gap-5 whitespace-nowrap">
          <Link href={paths.privacy} className={publicHeaderLink}>
            {legalCopy.privacyLink}
          </Link>
          <Link href={paths.terms} className={publicHeaderLink}>
            {legalCopy.termsLink}
          </Link>
        </nav>
      </PublicHeader>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="space-y-3 border-b pb-8">
          <p className="text-label text-text-dim">{legalCopy.version(text.version)}</p>
          <h1 className="text-title1 text-text sm:text-large-title">{text.title}</h1>
        </div>
        {text.draft && (
          <Notice tone="pending" className="mt-8">
            {legalCopy.draftBanner}
          </Notice>
        )}
        <p className="mt-8 text-body text-text">{text.intro}</p>
        <ol className="mt-10">
          {text.sections.map((section, index) => (
            <li key={section.title} className="space-y-3 border-t py-8">
              <h2 className="flex items-baseline gap-4 text-title3 text-text">
                <span aria-hidden className="text-label text-text-dim">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-body text-text">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="list-disc space-y-1.5 pl-6 text-body text-text marker:text-text-dim">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
