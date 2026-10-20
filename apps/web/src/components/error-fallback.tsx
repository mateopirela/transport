'use client';

import * as Sentry from '@sentry/nextjs';
import { errorBoundaryCopy as c } from '@transport/shared';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';

/**
 * What an error boundary shows (B25): a Spanish message, a retry and, when
 * Next.js gives one, the digest as a reference for support. The error itself
 * goes to Sentry (no-op without a DSN), never to the screen.
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
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <h1 className="text-title2 text-text">{c.title}</h1>
      <p className="text-callout text-text-dim">{body}</p>
      {error.digest && (
        <p className="text-caption text-text-faint tabular-nums">{c.reference(error.digest)}</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
          {c.home}
        </Link>
        <Button onClick={onRetry}>{retryLabel}</Button>
      </div>
    </main>
  );
}
