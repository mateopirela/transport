'use client';

import {
  appearanceCopy,
  shellCopy,
  supportCopy,
  supportWhatsappUrl,
  tripFolio,
  uiCopy,
  type ThemeChoice,
} from '@transport/shared';
import { ChevronsUpDown, LogOut, Menu, MessageCircle, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog, Popover } from 'radix-ui';
import { useState } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { DialogOverlay } from '@/components/ui/dialog';
import { focusRing } from '@/components/ui/variants';
import { signOut } from '@/lib/auth/actions';
import { activeNavHref, initialsOf, type NavItem } from '@/lib/nav';
import { tripIdFromPath } from '@/lib/support/trip-path';
import { cn } from '@/lib/utils';

/** A section of an area: its link, an icon and, after the label, a counter. */
export type ShellNavItem = NavItem & {
  label: string;
  /** A lucide icon, already rendered (`<Truck aria-hidden />`). */
  icon?: React.ReactNode;
  /** A counter after the label (unread notifications). */
  badge?: React.ReactNode;
};

/** Sections that go together under a short label; the first group needs none. */
export interface ShellNavGroup {
  label?: string;
  items: readonly ShellNavItem[];
}

/** The focus of what sits on the brand surface, which is Night in both themes. */
const brandFocus =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-text';

/**
 * The sections of the area (§1.5), in groups: each a link with its icon and
 * its counter. The current one is told by its ground, its weight and its
 * icon in the accent, and by `aria-current`. No filled buttons here: the
 * action of the area (`cta`, "Publicar carga") is an outlined link above.
 */
function ShellNav({
  groups,
  cta,
  onNavigate,
}: {
  groups: readonly ShellNavGroup[];
  cta?: ShellNavItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = groups.flatMap((group) => group.items);
  const active = activeNavHref(pathname, cta ? [...items, cta] : items);
  return (
    <nav aria-label={uiCopy.sections} className="flex flex-col px-3 pb-4">
      {cta && (
        <Link
          href={cta.href}
          onClick={onNavigate}
          aria-current={cta.href === active ? 'page' : undefined}
          className={cn(
            'mb-4 flex h-control items-center justify-center gap-2 rounded-lg border px-3 text-subhead font-semibold transition-colors duration-200 [&_svg]:size-4 [&_svg]:shrink-0',
            brandFocus,
            cta.href === active
              ? 'border-brand-accent bg-brand-selected text-brand-text'
              : 'border-brand-text-dim text-brand-text hover:bg-brand-selected',
          )}
        >
          {cta.icon}
          {cta.label}
        </Link>
      )}
      {groups.map((group, index) => (
        <div
          key={group.label ?? index}
          role={group.label ? 'group' : undefined}
          aria-label={group.label}
          // A group without a label (after the first) is set apart by a hairline.
          className={!group.label && index > 0 ? 'mt-3 border-t border-brand-line pt-3' : undefined}
        >
          {group.label && (
            <p aria-hidden className="px-3 pt-5 pb-2 text-label text-brand-text-dim">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const current = item.href === active;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex h-control items-center gap-3 rounded-sm px-3 text-subhead transition-colors duration-200',
                      brandFocus,
                      current
                        ? 'bg-brand-selected font-semibold text-brand-text'
                        : 'text-brand-text-dim hover:bg-brand-selected hover:text-brand-text',
                    )}
                  >
                    {item.icon && (
                      <span
                        className={cn(
                          'flex shrink-0 [&_svg]:size-4',
                          current && 'text-brand-accent',
                        )}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** "Ayuda" of the account menu (I2): the support WhatsApp, as the shell loaded it. */
export interface ShellHelp {
  whatsapp: string;
  hours: string | null;
  roleLabel: string | null;
}

/**
 * "Ayuda" (I2, D41): opens WhatsApp with a message that says the role and,
 * on a trip's page, its folio.
 */
function HelpLink({ help }: { help: ShellHelp }) {
  const tripId = tripIdFromPath(usePathname());
  const folio = tripFolio(tripId);
  const href = supportWhatsappUrl({ whatsapp: help.whatsapp, roleLabel: help.roleLabel, tripId });
  if (!href) return null;
  return (
    <div className="border-t py-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="support-help"
        // The page colour on hover, not the raised surface: the icon is accent text (§1.1).
        className={cn('flex items-start gap-3 rounded-sm px-3 py-2 hover:bg-bg', focusRing)}
      >
        <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-text" />
        <span className="min-w-0">
          <span className="block text-subhead font-semibold text-text">{supportCopy.help}</span>
          <span className="block text-footnote text-text-dim">
            {folio ? supportCopy.helpWithTrip(folio) : supportCopy.helpSubtitle}
          </span>
          {help.hours && (
            <span className="block text-footnote text-text-dim">
              {supportCopy.hours(help.hours)}
            </span>
          )}
        </span>
      </a>
    </div>
  );
}

/**
 * The account, at the foot of the sidebar (the initials alone in the top bar
 * of a phone): opens who is signed in, "Ayuda" (when support has a number),
 * "Apariencia" and "Cerrar sesión".
 */
function AccountMenu({
  name,
  company,
  theme,
  help,
}: {
  name: string | null;
  company: string | null;
  theme: ThemeChoice;
  help: ShellHelp | null;
}) {
  const initials = initialsOf(name ?? company);
  // Here and not in the switcher: the popover's content unmounts when it closes.
  const [choice, setChoice] = useState(theme);
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={uiCopy.account}
        className={cn(
          'flex shrink-0 cursor-pointer items-center gap-3 rounded-full text-left transition-colors duration-200 hover:bg-brand-selected lg:w-full lg:rounded-sm lg:p-2',
          brandFocus,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-selected text-footnote font-semibold text-brand-text">
          {initials || <UserRound aria-hidden className="size-4" />}
        </span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-subhead font-medium text-brand-text">
            {name ?? company ?? uiCopy.account}
          </span>
          {name && company && (
            <span className="block truncate text-footnote text-brand-text-dim">{company}</span>
          )}
        </span>
        <ChevronsUpDown
          aria-hidden
          className="hidden size-4 shrink-0 text-brand-text-dim lg:block"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-72 border bg-cell p-2 text-text duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {(name ?? company) && (
            <div className="px-3 pt-2 pb-3">
              {name && <p className="truncate text-headline">{name}</p>}
              {company && <p className="truncate text-subhead text-text-dim">{company}</p>}
            </div>
          )}
          {help && <HelpLink help={help} />}
          <div className="border-t px-3 py-3">
            <p className="mb-2 text-label text-text-dim">{appearanceCopy.title}</p>
            <ThemeSwitcher
              value={choice}
              onChange={setChoice}
              className="flex w-full [&>*]:flex-1"
            />
          </div>
          <form action={signOut} className="border-t pt-2">
            <Button
              type="submit"
              variant="plain"
              size="sm"
              className="w-full justify-start px-3 text-red-text hover:bg-bg hover:text-red-text"
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

/**
 * The same navigation in a panel, under 1024 px (§1.5): the menu button of
 * the top bar opens it from the left. Its content exists only while open, so
 * a section is never twice in the page; choosing one closes it.
 */
function MenuPanel({
  area,
  groups,
  cta,
}: {
  area?: string;
  groups: readonly ShellNavGroup[];
  cta?: ShellNavItem;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={uiCopy.openMenu}
        className={cn(
          '-ml-2 flex size-control shrink-0 cursor-pointer items-center justify-center rounded-sm text-brand-text transition-colors duration-200 hover:bg-brand-selected lg:hidden',
          brandFocus,
        )}
      >
        <Menu aria-hidden className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <DialogOverlay className="lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-brand-line bg-brand-bg text-brand-text duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden"
        >
          <Dialog.Title className="sr-only">{uiCopy.menu}</Dialog.Title>
          <div className="flex h-14 shrink-0 items-center gap-3 px-4">
            <BrandMark />
            {area && <span className="text-label text-brand-text-dim">{area}</span>}
            <Dialog.Close
              aria-label={uiCopy.close}
              className={cn(
                '-mr-2 ml-auto flex size-control shrink-0 cursor-pointer items-center justify-center rounded-sm text-brand-text-dim transition-colors duration-200 hover:bg-brand-selected hover:text-brand-text',
                brandFocus,
              )}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className="pt-2">
            <ShellNav groups={groups} cta={cta} onNavigate={() => setOpen(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The frame around a signed-in area (§1.5), on the brand surface (Night in
 * both themes): from 1024 px a sidebar of 240 px that stays in place, with
 * the brand, the sections in groups and the account at its foot; under
 * 1024 px a top bar with the menu button, the brand and the account. One
 * element, so the brand, the area and the account are once in the page.
 */
export function ShellChrome({
  area,
  groups,
  cta,
  name,
  company,
  theme,
  help,
}: {
  area?: string;
  groups: readonly ShellNavGroup[];
  cta?: ShellNavItem;
  name: string | null;
  company: string | null;
  theme: ThemeChoice;
  help: ShellHelp | null;
}) {
  const hasNav = groups.length > 0 || cta !== undefined;
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-brand-line bg-brand-bg px-4 text-brand-text lg:fixed lg:inset-y-0 lg:left-0 lg:h-auto lg:w-60 lg:flex-col lg:items-stretch lg:gap-0 lg:border-r lg:border-b-0 lg:px-0">
      {hasNav && <MenuPanel area={area} groups={groups} cta={cta} />}
      <div className="flex min-w-0 items-center gap-3 lg:shrink-0 lg:flex-col lg:items-start lg:gap-2 lg:px-6 lg:pt-6 lg:pb-4">
        <Link href="/" className={cn('rounded-sm', brandFocus)}>
          <BrandMark />
        </Link>
        {area && <span className="max-w-full truncate text-label text-brand-text-dim">{area}</span>}
      </div>
      <div className="hidden min-h-0 flex-1 overflow-y-auto pt-2 lg:block">
        {hasNav && <ShellNav groups={groups} cta={cta} />}
      </div>
      <div className="ml-auto lg:ml-0 lg:shrink-0 lg:border-t lg:border-brand-line lg:p-3">
        <AccountMenu name={name} company={company} theme={theme} help={help} />
      </div>
    </header>
  );
}
