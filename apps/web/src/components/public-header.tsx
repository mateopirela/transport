import Link from 'next/link';
import type * as React from 'react';

import { BrandMark } from '@/components/brand-mark';
import { paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

/**
 * The bar of the pages without a session (docs/plan-fulmis.md §1.4 and §2
 * V5): the brand on Night, in both themes, as on the sidebar and the access,
 * so a shared link or a legal page reads as the same product. `children` go
 * on the right (the legal links, who shared the page).
 */
export function PublicHeader({
  width = 'max-w-3xl',
  children,
}: {
  /** The width of the page under it, so the brand lines up with its text. */
  width?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-brand-line bg-brand-bg text-brand-text">
      <div
        className={cn(
          'mx-auto flex min-h-14 w-full flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 sm:px-6',
          width,
        )}
      >
        <Link
          href={paths.home}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-text"
        >
          <BrandMark />
        </Link>
        {children}
      </div>
    </header>
  );
}

/** A quiet link of the public bar (on Night). */
export const publicHeaderLink =
  'rounded-sm text-subhead text-brand-text-dim transition-colors duration-200 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text';
