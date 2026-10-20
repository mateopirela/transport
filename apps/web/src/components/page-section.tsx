import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A section of a page (§1.2: `title2` in sections): the heading, an optional
 * line under it, an optional control on the right, and its content.
 */
export function PageSection({
  title,
  description,
  action,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A small control next to the heading (a secondary button, a link). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h2 className="text-title2 text-text">{title}</h2>
          {description && <p className="text-subhead text-text-dim">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "Volver a …" above a detail's title: a quiet link with a chevron. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 mb-4 inline-flex items-center gap-0.5 rounded-sm text-subhead text-accent-text outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <ChevronLeft aria-hidden className="size-4" />
      {children}
    </Link>
  );
}

/** A text link inside a table or a line of text, in the accent's text tone. */
export const textLink = 'text-accent-text underline-offset-4 hover:underline';
