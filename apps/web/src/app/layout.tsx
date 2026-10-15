import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';
import { Manrope, Marcellus } from 'next/font/google';

import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const marcellus = Marcellus({ subsets: ['latin'], weight: '400', variable: '--font-marcellus' });

export const metadata: Metadata = {
  title: { default: authCopy.appName, template: `%s · ${authCopy.appName}` },
  description: authCopy.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${manrope.variable} ${marcellus.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
