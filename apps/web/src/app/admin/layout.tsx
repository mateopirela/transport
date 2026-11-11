import {
  adminBillingCopy,
  adminCopy,
  adminOpsCopy,
  adminSettingsCopy,
  brokeredCopy,
  freightCopy,
  navCopy,
  roadsCopy,
  shellCopy,
} from '@transport/shared';
import {
  Banknote,
  ClipboardCheck,
  CreditCard,
  Handshake,
  House,
  Milestone,
  Package,
  Route,
  ScrollText,
  Settings,
  TriangleAlert,
  Users,
} from 'lucide-react';

import { AppShell, type ShellNavGroup } from '@/components/app-shell';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

/** The sections of the admin, in the groups of §1.5. */
const GROUPS: readonly ShellNavGroup[] = [
  { items: [{ href: paths.admin, label: adminCopy.nav.home, icon: <House aria-hidden /> }] },
  {
    label: navCopy.groups.verification,
    items: [
      { href: paths.adminQueue, label: adminCopy.nav.queue, icon: <ClipboardCheck aria-hidden /> },
      { href: paths.adminUsers, label: adminCopy.nav.users, icon: <Users aria-hidden /> },
    ],
  },
  {
    label: navCopy.groups.operation,
    items: [
      { href: paths.adminLoads, label: adminOpsCopy.nav.loads, icon: <Package aria-hidden /> },
      { href: paths.adminBrokered, label: brokeredCopy.admin.nav, icon: <Handshake aria-hidden /> },
      { href: paths.adminTrips, label: adminOpsCopy.nav.trips, icon: <Route aria-hidden /> },
      {
        href: paths.adminIncidents,
        label: adminOpsCopy.nav.incidents,
        icon: <TriangleAlert aria-hidden />,
      },
      { href: paths.adminRoads, label: roadsCopy.admin.title, icon: <Milestone aria-hidden /> },
    ],
  },
  {
    label: navCopy.groups.money,
    items: [
      { href: paths.adminFreight, label: freightCopy.admin.nav, icon: <Banknote aria-hidden /> },
      {
        href: paths.adminSubscriptions,
        label: adminBillingCopy.nav,
        icon: <CreditCard aria-hidden />,
      },
    ],
  },
  {
    label: navCopy.groups.system,
    items: [
      { href: paths.adminAudit, label: adminCopy.nav.audit, icon: <ScrollText aria-hidden /> },
      { href: paths.adminSettings, label: adminSettingsCopy.nav, icon: <Settings aria-hidden /> },
    ],
  },
];

/** Admin area: only `admin` profiles (also checked by the proxy and each page). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAccess(paths.admin);
  return (
    <AppShell area={shellCopy.adminArea} groups={GROUPS} viewer={viewer}>
      {children}
    </AppShell>
  );
}
