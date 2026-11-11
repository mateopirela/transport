import {
  clientTripsCopy,
  freightCopy,
  loadsCopy,
  notificationsInboxCopy,
  shellCopy,
  shipperCompanyCopy,
} from '@transport/shared';
import { Bell, Building2, House, Package, Plus, Truck, Wallet } from 'lucide-react';

import { AppShell, type ShellNavGroup, type ShellNavItem } from '@/components/app-shell';
import { NotificationBadge } from '@/components/notifications/notification-badge';
import { unreadNotificationCount } from '@/lib/notifications/queries';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

/** "Publicar carga": the action of the area, above the sections (§1.5). */
const PUBLISH: ShellNavItem = {
  href: paths.newLoad,
  label: loadsCopy.nav.newLoad,
  icon: <Plus aria-hidden />,
};

/** Shipper area: only shippers whose company is approved. */
export default async function ShipperLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAccess(paths.shipper);
  const unread = await unreadNotificationCount(viewer.userId);
  const groups: ShellNavGroup[] = [
    {
      items: [
        { href: paths.shipper, label: loadsCopy.nav.home, icon: <House aria-hidden /> },
        { href: paths.shipperLoads, label: loadsCopy.nav.loads, icon: <Package aria-hidden /> },
        { href: paths.shipperTrips, label: clientTripsCopy.nav, icon: <Truck aria-hidden /> },
        {
          href: paths.shipperPortfolio,
          label: freightCopy.portfolio.title,
          icon: <Wallet aria-hidden />,
        },
        {
          href: paths.shipperCompany,
          label: shipperCompanyCopy.nav,
          icon: <Building2 aria-hidden />,
        },
        {
          href: paths.shipperNotifications,
          label: notificationsInboxCopy.nav,
          icon: <Bell aria-hidden />,
          badge: <NotificationBadge key={unread} userId={viewer.userId} initialCount={unread} />,
        },
      ],
    },
  ];
  return (
    <AppShell area={shellCopy.shipperArea} groups={groups} cta={PUBLISH} viewer={viewer}>
      {children}
    </AppShell>
  );
}
