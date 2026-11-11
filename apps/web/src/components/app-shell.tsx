import { shellCopy, supportRoleLabel } from '@transport/shared';
import { cookies } from 'next/headers';

import { ShellChrome, type ShellNavGroup, type ShellNavItem } from '@/components/app-shell-client';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';
import { loadSupportSettings } from '@/lib/support/queries';
import { themeChoiceFromCookie, THEME_COOKIE } from '@/lib/theme';
import type { ViewerDetails } from '@/lib/viewer';

export type { ShellNavGroup, ShellNavItem };

/** The width of a public page: 1040 px, 16 from the edges on a phone and 24 from a tablet up. */
export const PAGE_CONTAINER = 'mx-auto w-full max-w-260 px-4 sm:px-6';

/**
 * The width of a page inside the shell (§1.5): up to 1200 px next to the
 * sidebar, so a table of six columns fits at 1440; 16 from the edges on a
 * phone, 24 from a tablet and 40 on the desktop.
 */
const SHELL_CONTAINER = 'mx-auto w-full max-w-300 px-4 sm:px-6 lg:px-10';

/**
 * The frame of a signed-in area (Cliente, Gerente or Coordinador, or Admin;
 * §1.5): the sidebar with the brand, the sections in `groups` and the account
 * (a top bar with a menu panel under 1024 px), and the page next to it.
 *
 * `cta` is the action of the area that lives in the navigation (the Cliente's
 * "Publicar carga"): an outlined link above the sections. `toolbar` holds the
 * controls that narrow every page of the area (the business unit picker), in
 * a strip over the page.
 */
export async function AppShell({
  area,
  groups = [],
  cta,
  toolbar,
  viewer,
  children,
}: {
  area?: string;
  /** The sections of the area, in groups; each with an icon and maybe a counter. */
  groups?: readonly ShellNavGroup[];
  cta?: ShellNavItem;
  toolbar?: React.ReactNode;
  viewer: ViewerDetails;
  children: React.ReactNode;
}) {
  const theme = themeChoiceFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  // "Ayuda" (I2, D41): everyone but the admin, who is the support; without a
  // number it does not show, and it never takes the shell down.
  const support = viewer.role === 'admin' ? null : await loadSupportSettings().catch(() => null);
  const help = support?.whatsapp
    ? {
        whatsapp: support.whatsapp,
        hours: support.hours,
        roleLabel: supportRoleLabel(viewer.role, viewer.company?.isOwnerOperator === true),
      }
    : null;
  return (
    <div className="flex min-h-dvh flex-col lg:pl-60">
      <ShellChrome
        area={area}
        groups={groups}
        cta={cta}
        name={viewer.fullName}
        company={viewer.company?.legalName ?? null}
        theme={theme}
        help={help}
      />
      {toolbar && (
        <div className="border-b">
          <div className={`${SHELL_CONTAINER} flex min-h-12 items-center justify-end py-2`}>
            {toolbar}
          </div>
        </div>
      )}
      <main className={`${SHELL_CONTAINER} flex-1 py-8 lg:py-10 lg:text-subhead`}>{children}</main>
    </div>
  );
}

/** "Cerrar sesión" outside the shell (the auth screens of a signed-in user). */
export function SignOutButton({
  variant,
  className,
}: {
  variant: 'plain' | 'link';
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
