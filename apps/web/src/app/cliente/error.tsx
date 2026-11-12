'use client';

import * as Sentry from '@sentry/nextjs';
import { errorBoundaryCopy as c } from '@transport/shared';
import { CircleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';

/**
 * Error boundary of the client's pages (§1.5, "errores con reintento"):
 * inside the shell, so the sidebar stays and the client can retry or go
 * elsewhere. The error goes to Sentry (no-op without a DSN), never to the
 * screen; the digest is the reference for support.
 */
export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Empty
      icon={CircleAlert}
      title={c.title}
      description={
        <>
          {c.body}
          {error.digest && (
            <span className="mt-2 block text-meta text-text-dim">{c.reference(error.digest)}</span>
          )}
        </>
      }
      action={<Button onClick={reset}>{c.retry}</Button>}
      className="mt-8"
    />
  );
}
