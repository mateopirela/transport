import { authCopy, legalCopy, type LegalText } from '@transport/shared';
import Link from 'next/link';

import { paths } from '@/lib/routing';

/** Public legal page (B27): privacy notice or terms, readable without a session. */
export function LegalDocument({ text }: { text: LegalText }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-navy px-4 py-6 text-navy-foreground sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link href={paths.home} className="text-xl">
            {authCopy.appName}
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href={paths.privacy} className="hover:underline">
              {legalCopy.privacyLink}
            </Link>
            <Link href={paths.terms} className="hover:underline">
              {legalCopy.termsLink}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-8">
        {text.draft && (
          <p
            role="note"
            className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm"
          >
            {legalCopy.draftBanner}
          </p>
        )}
        <div className="space-y-2">
          <h1 className="text-3xl leading-tight">{text.title}</h1>
          <p className="text-sm text-muted-foreground">{legalCopy.version(text.version)}</p>
        </div>
        <p className="leading-relaxed">{text.intro}</p>
        {text.sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-xl">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.items && (
              <ul className="list-disc space-y-1 pl-6 leading-relaxed">
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
