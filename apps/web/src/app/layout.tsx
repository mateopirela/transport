import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';

import { themeClass, themeChoiceFromCookie, THEME_COOKIE } from '@/lib/theme';

import './globals.css';

// The two families of Fulmis (D26-E2, docs/plan-fulmis.md §1.2): Geist for text and titles,
// Geist Mono for labels and metadata.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: { default: authCopy.appName, template: `%s · ${authCopy.appName}` },
  description: authCopy.tagline,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The theme chosen in the account menu, read here so the first paint is already right.
  const choice = themeChoiceFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="es-MX"
      className={`${geist.variable} ${geistMono.variable} ${themeClass(choice)}`.trim()}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
