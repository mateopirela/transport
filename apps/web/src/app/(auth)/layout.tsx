import { brandPanelCopy } from '@transport/shared';
import Link from 'next/link';

import { BrandMark } from '@/components/brand-mark';

/**
 * The access (§1.5), a split screen: the brand panel, Night in both themes,
 * with the brand and three lines of what the platform does, and the form on
 * the page next to it. Under 900 px the panel is only a header with the
 * brand. The lines are not headings: the title of each screen is its `h1`.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col min-[900px]:flex-row">
      <header className="flex h-14 shrink-0 items-center border-b border-brand-line bg-brand-bg px-4 text-brand-text min-[900px]:sticky min-[900px]:top-0 min-[900px]:h-dvh min-[900px]:w-2/5 min-[900px]:max-w-140 min-[900px]:flex-col min-[900px]:items-start min-[900px]:justify-between min-[900px]:border-r min-[900px]:border-b-0 min-[900px]:p-12">
        <Link
          href="/"
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-text"
        >
          <BrandMark />
        </Link>
        <div className="hidden w-full min-[900px]:block">
          <p className="text-label text-brand-text-dim">{brandPanelCopy.kicker}</p>
          <p className="mt-4 text-large-title text-brand-text">{brandPanelCopy.headline}</p>
          <ul className="mt-10">
            {brandPanelCopy.lines.map((line, index) => (
              <li
                key={line}
                className="flex items-baseline gap-4 border-t border-brand-line py-4 text-subhead text-brand-text"
              >
                <span aria-hidden className="text-label text-brand-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  );
}
