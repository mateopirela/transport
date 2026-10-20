import { authCopy, shellCopy } from '@transport/shared';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { AccountMenu, NavTabs, type ShellNavItem } from '@/components/app-shell-client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { signOut } from '@/lib/auth/actions';
import { themeChoiceFromCookie, THEME_COOKIE } from '@/lib/theme';
import type { ViewerDetails } from '@/lib/viewer';

/** The width of a page (§1.3): 1040 px, 16 from the edges on a phone and 24 from a tablet up. */
export const PAGE_CONTAINER = 'mx-auto w-full max-w-260 px-4 sm:px-6';

/**
 * The frame of a signed-in area (Cliente, Gerente or Coordinador, or Admin;
 * §1.6): a light glass bar that stays on top, with the name and the area, the
 * account on the right, and under them the sections as text tabs and any
 * controls of the area (the business unit picker).
 */
export async function AppShell({
  area,
  nav,
  toolbar,
  viewer,
  children,
}: {
  area?: string;
  /** Sections of the area, optionally with a badge. */
  nav?: readonly ShellNavItem[];
  /** Controls at the end of the section bar (e.g. the business unit picker). */
  toolbar?: React.ReactNode;
  viewer: ViewerDetails;
  children: React.ReactNode;
}) {
  const theme = themeChoiceFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-glass-line bg-glass backdrop-blur-xl backdrop-saturate-150">
        <div className={`${PAGE_CONTAINER} flex h-14 items-center gap-3`}>
          <Link href="/" className="text-headline text-text">
            {authCopy.appName}
          </Link>
          {area && <span className="text-subhead text-text-dim">{area}</span>}
          <div className="ml-auto">
            <AccountMenu
              name={viewer.fullName}
              company={viewer.company?.legalName ?? null}
              theme={theme}
            />
          </div>
        </div>
        {(nav ?? toolbar) && (
          <div className={`${PAGE_CONTAINER} flex flex-wrap items-center gap-x-4`}>
            {nav && <NavTabs items={nav} />}
            {toolbar && <div className="ml-auto py-1.5">{toolbar}</div>}
          </div>
        )}
      </header>
      <main className={`${PAGE_CONTAINER} flex-1 py-8 sm:py-10`}>{children}</main>
    </div>
  );
}

/** "Cerrar sesión" outside the shell (the auth screens of a signed-in user). */
export function SignOutButton({
  variant,
  className,
}: {
  variant: 'plain' | 'link' | 'ghost';
  className?: string;
}) {
  return (
    <form action={signOut}>
      <Button type="submit" variant={variant} size="sm" className={className}>
        {shellCopy.signOut}
      </Button>
    </form>
  );
}

/** The title block of a screen: `PageHeader` by its old name, until U7 and U8 move the screens. */
export function PageHeading({ title, description }: { title: string; description?: string }) {
  return <PageHeader title={title} description={description} />;
}
