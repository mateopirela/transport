import { authCopy, shellCopy } from '@transport/shared';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';
import { themeChoiceFromCookie, THEME_COOKIE } from '@/lib/theme';
import type { ViewerDetails } from '@/lib/viewer';

/** Header and frame of the signed-in area (Cliente, Gerente or Coordinador, or Admin). */
export async function AppShell({
  area,
  nav,
  toolbar,
  viewer,
  children,
}: {
  area?: string;
  /** Section links shown under the header, optionally with a badge. */
  nav?: readonly { href: string; label: string; badge?: React.ReactNode }[];
  /** Controls at the end of the section bar (e.g. the business unit picker). */
  toolbar?: React.ReactNode;
  viewer: ViewerDetails;
  children: React.ReactNode;
}) {
  const theme = themeChoiceFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <Link href="/" className="font-serif text-xl">
            {authCopy.appName}
          </Link>
          {area && (
            <span className="rounded-full border border-navy-foreground/25 px-2.5 py-0.5 text-xs">
              {area}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1 text-sm sm:gap-3">
            <span className="hidden text-navy-foreground/75 sm:inline">
              {viewer.company?.legalName ?? viewer.fullName}
            </span>
            <ThemeSwitcher initial={theme} className="border-navy-foreground/25" />
            <SignOutButton variant="ghost" className="hover:bg-white/10" />
          </div>
        </div>
        <div className="h-0.5 bg-accent" />
      </header>
      {nav && (
        <nav className="border-b bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 px-4 text-sm sm:px-6">
            <ul className="flex gap-1 overflow-x-auto">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-block px-3 py-3 whitespace-nowrap text-muted-foreground hover:text-foreground"
                  >
                    {item.label}
                    {item.badge}
                  </Link>
                </li>
              ))}
            </ul>
            {toolbar && <div className="ml-auto py-2">{toolbar}</div>}
          </div>
        </nav>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

export function SignOutButton({
  variant,
  className,
}: {
  variant: 'ghost' | 'link';
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

/** Title block of a screen. */
export function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8 space-y-2">
      <h1 className="text-3xl sm:text-4xl">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}
