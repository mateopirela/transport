import { loadsCopy, notificationsInboxCopy, shellCopy } from '@transport/shared';

import { AppShell } from '@/components/app-shell';
import { NotificationBadge } from '@/components/notifications/notification-badge';
import { unreadNotificationCount } from '@/lib/notifications/queries';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

/** Shipper area: only shippers whose company is approved. */
export default async function ShipperLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAccess(paths.shipper);
  const unread = await unreadNotificationCount(viewer.userId);
  const nav = [
    { href: paths.shipper, label: loadsCopy.nav.home },
    { href: paths.shipperLoads, label: loadsCopy.nav.loads },
    { href: paths.newLoad, label: loadsCopy.nav.newLoad },
    {
      href: paths.shipperNotifications,
      label: notificationsInboxCopy.nav,
      badge: <NotificationBadge key={unread} userId={viewer.userId} initialCount={unread} />,
    },
  ];
  return (
    <AppShell area={shellCopy.shipperArea} nav={nav} viewer={viewer}>
      {children}
    </AppShell>
  );
}
