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
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-serif text-2xl">{c.title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {error.digest && <p className="text-xs text-muted-foreground">{c.reference(error.digest)}</p>}
      <div className="flex gap-3">
        <Button onClick={onRetry}>{retryLabel}</Button>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          {c.home}
        </Link>
      </div>
    </main>
  );
}
