'use client';

import { errorBoundaryCopy as c } from '@transport/shared';
import { Geist, Geist_Mono } from 'next/font/google';
import { useSyncExternalStore } from 'react';

import { ErrorFallback } from '@/components/error-fallback';
import { themeChoiceFromCookieString, themeClass, WEB_DEFAULT_THEME_CHOICE } from '@/lib/theme';

import './globals.css';

// The families of the root layout (§1.2): this page replaces it.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

/** The cookie never changes while this page is up: nothing to subscribe to. */
const subscribe = () => () => undefined;

/**
 * Last-resort boundary (B25): replaces the root layout when it fails, so it
 * renders its own <html>, with the theme the layout would have given it
 * (D26-E1): the one chosen in "Apariencia", and light without a choice,
 * whatever the system prefers. Reloading is the only safe way back.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const theme = useSyncExternalStore(
    subscribe,
    () => themeClass(themeChoiceFromCookieString(document.cookie)),
    () => themeClass(WEB_DEFAULT_THEME_CHOICE),
  );
  return (
    <html lang="es-MX" className={`${geist.variable} ${geistMono.variable} ${theme}`.trim()}>
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
