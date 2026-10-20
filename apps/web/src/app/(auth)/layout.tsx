import { authCopy } from '@transport/shared';
import Link from 'next/link';

/**
 * The auth flows on the warm page (§1.7): the name and the tagline on top,
 * then one column with the screen. No brand panel: the form is the screen.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-10 text-center">
        <Link href="/" className="text-headline text-text">
          {authCopy.appName}
        </Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
