'use client';

import { errorBoundaryCopy as c } from '@transport/shared';

import { ErrorFallback } from '@/components/error-fallback';

import './globals.css';

/**
 * Last-resort boundary (B25): replaces the root layout when it fails, so it
 * renders its own <html>. Reloading is the only safe way back.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="es-MX">
      <body className="min-h-dvh">
        <ErrorFallback
          error={error}
          body={c.globalBody}
          retryLabel={c.reload}
          onRetry={() => window.location.reload()}
        />
      </body>
    </html>
  );
}
