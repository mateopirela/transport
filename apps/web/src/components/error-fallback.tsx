'use client';

import * as Sentry from '@sentry/nextjs';
import { errorBoundaryCopy as c } from '@transport/shared';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';

/**
 * What an error boundary shows (B25): a Spanish message, a retry (the
 * screen's one primary) and, when Next.js gives one, the digest as a
 * reference for support, in mono. The error itself goes to Sentry (no-op
 * without a DSN), never to the screen.
 */
export function ErrorFallback({
  error,
  onRetry,
  retryLabel = c.retry,
  body = c.body,
}: {
  error: Error & { digest?: string };
  onRetry: () => void;
  retryLabel?: string;
  body?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md border bg-cell">
        <div className="space-y-3 px-6 pt-8 pb-6">
          <TriangleAlert aria-hidden className="size-6 text-red-text" />
          <h1 className="text-title2 text-text">{c.title}</h1>
          <p className="text-callout text-text-dim">{body}</p>
          {error.digest && (
            <p className="text-meta text-text-dim tabular-nums">{c.reference(error.digest)}</p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
            {c.home}
          </Link>
          <Button onClick={onRetry}>{retryLabel}</Button>
        </div>
      </div>
    </main>
  );
}
