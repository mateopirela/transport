import { authCopy, shellCopy } from '@transport/shared';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';
import type { ViewerDetails } from '@/lib/viewer';

/** Header and frame of the signed-in area (Cliente or Admin). */
export function AppShell({
  area,
  viewer,
  children,
}: {
  area?: string;
  viewer: ViewerDetails;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="font-serif text-xl">
            {authCopy.appName}
          </Link>
          {area && (
            <span className="rounded-full border border-navy-foreground/25 px-2.5 py-0.5 text-xs">
              {area}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-navy-foreground/75 sm:inline">
              {viewer.company?.legalName ?? viewer.fullName}
            </span>
            <SignOutButton variant="ghost" className="hover:bg-white/10" />
          </div>
        </div>
        <div className="h-0.5 bg-accent" />
      </header>
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
