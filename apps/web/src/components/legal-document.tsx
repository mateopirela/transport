import { authCopy, legalCopy, type LegalText } from '@transport/shared';
import Link from 'next/link';

import { Notice } from '@/components/ui/notice';
import { paths } from '@/lib/routing';

const navLink =
  'rounded-full px-3 py-1.5 text-subhead text-text-dim transition-colors duration-200 outline-none hover:bg-surface-high hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/40';

/**
 * Public legal page (B27): privacy notice or terms, readable without a
 * session. The light glass bar of the shell with the name and the two
 * documents, then one reading column on the warm page.
 */
export function LegalDocument({ text }: { text: LegalText }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-glass-line bg-glass backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={paths.home} className="text-headline text-text">
            {authCopy.appName}
          </Link>
          <nav className="-mr-3 flex gap-1">
            <Link href={paths.privacy} className={navLink}>
              {legalCopy.privacyLink}
            </Link>
            <Link href={paths.terms} className={navLink}>
              {legalCopy.termsLink}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 py-10 sm:px-6 sm:py-14">
        <div className="space-y-2">
          <h1 className="text-title1 text-text sm:text-large-title">{text.title}</h1>
          <p className="text-subhead text-text-dim">{legalCopy.version(text.version)}</p>
        </div>
        {text.draft && <Notice tone="info">{legalCopy.draftBanner}</Notice>}
        <p className="text-body text-text">{text.intro}</p>
        {text.sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-title3 text-text">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-body text-text">
                {paragraph}
              </p>
            ))}
            {section.items && (
              <ul className="list-disc space-y-1.5 pl-6 text-body text-text marker:text-text-faint">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
