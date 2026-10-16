'use client';

import { ErrorFallback } from '@/components/error-fallback';

/** Error boundary of every page below the root layout (B25). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} onRetry={reset} />;
}
