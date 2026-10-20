import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';
import { Hanken_Grotesk } from 'next/font/google';
import { cookies } from 'next/headers';

import { themeClass, themeChoiceFromCookie, THEME_COOKIE } from '@/lib/theme';

import './globals.css';

// One family (D26): Hanken Grotesk, 400 to 700.
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-hanken',
});

export const metadata: Metadata = {
  title: { default: authCopy.appName, template: `%s · ${authCopy.appName}` },
  description: authCopy.tagline,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The theme chosen in the account menu, read here so the first paint is already right.
  const choice = themeChoiceFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="es-MX" className={`${hanken.variable} ${themeClass(choice)}`.trim()}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
