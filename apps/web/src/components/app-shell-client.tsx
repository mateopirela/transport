'use client';

import { appearanceCopy, shellCopy, uiCopy, type ThemeChoice } from '@transport/shared';
import { LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Popover } from 'radix-ui';

import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';
import { activeNavHref, initialsOf, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';

export type ShellNavItem = NavItem & { label: string; badge?: React.ReactNode };

/**
 * The sections of the area as text tabs (§1.6): the current one in the ink
 * with a short accent line under it, the rest secondary. Scrolls sideways
 * on a phone.
 */
export function NavTabs({ items }: { items: readonly ShellNavItem[] }) {
  const pathname = usePathname();
  const active = activeNavHref(pathname, items);
  return (
    <nav aria-label={uiCopy.sections} className="-mx-2 min-w-0 flex-1 overflow-x-auto">
      <ul className="flex">
        {items.map((item) => {
          const current = item.href === active;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-11 items-center px-2.5 text-subhead whitespace-nowrap transition-colors duration-200 outline-none focus-visible:text-text',
                  current
                    ? 'font-semibold text-text after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent'
                    : 'text-text-dim hover:text-text',
                )}
              >
                {item.label}
                {item.badge}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The account in the top bar: a round button with the initials that opens
 * who is signed in, "Apariencia" and "Cerrar sesión".
 */
export function AccountMenu({
  name,
  company,
  theme,
}: {
  name: string | null;
  company: string | null;
  theme: ThemeChoice;
}) {
  const initials = initialsOf(name ?? company);
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={uiCopy.account}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-soft text-footnote font-semibold text-accent-text transition-opacity outline-none hover:opacity-85 focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {initials || <UserRound aria-hidden className="size-4.5" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 w-72 rounded-2xl border bg-cell p-2 text-text duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {(name ?? company) && (
            <div className="px-3 pt-2 pb-3">
              {name && <p className="truncate text-headline">{name}</p>}
              {company && <p className="truncate text-subhead text-text-dim">{company}</p>}
            </div>
          )}
          <div className="border-t px-3 py-3">
            <p className="mb-2 text-label text-text-dim">{appearanceCopy.title}</p>
            <ThemeSwitcher initial={theme} className="flex w-full [&>*]:flex-1" />
          </div>
          <form action={signOut} className="border-t pt-2">
            <Button
              type="submit"
              variant="plain"
              size="sm"
              className="w-full justify-start px-3 text-red-text hover:bg-red/10 hover:text-red-text"
            >
              <LogOut aria-hidden />
              {shellCopy.signOut}
            </Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
