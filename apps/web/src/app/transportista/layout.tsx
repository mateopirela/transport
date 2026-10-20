import {
  carrierWebCopy,
  managerCompanyCopy,
  notificationsInboxCopy,
  shellCopy,
} from '@transport/shared';

import { AppShell } from '@/components/app-shell';
import { BusinessUnitPicker } from '@/components/carrier/business-unit-picker';
import { NotificationBadge } from '@/components/notifications/notification-badge';
import { carrierContext } from '@/lib/carrier/context';
import { unreadNotificationCount } from '@/lib/notifications/queries';
import { paths } from '@/lib/routing';

/**
 * Carrier area (G10a, D06-E1): the Gerente and the Coordinador of an approved
 * carrier. Loads and negotiations (G10a), trips and the fleet (G10b) and,
 * for the Gerente, "Mi empresa" (G4). The business unit picker narrows what
 * every screen lists (D19).
 */
export default async function CarrierLayout({ children }: { children: React.ReactNode }) {
  const { viewer, units, isManager } = await carrierContext(paths.carrier);
  const unread = await unreadNotificationCount(viewer.userId);
  const nav = [
    { href: paths.carrier, label: carrierWebCopy.nav.home },
    { href: paths.carrierLoads, label: carrierWebCopy.nav.loads },
    { href: paths.carrierNegotiations, label: carrierWebCopy.nav.negotiations },
    { href: paths.carrierTrips, label: carrierWebCopy.nav.trips },
    { href: paths.carrierUnits, match: paths.carrierFleet, label: carrierWebCopy.nav.fleet },
    ...(isManager ? [{ href: paths.carrierCompany, label: managerCompanyCopy.title }] : []),
    {
      href: paths.carrierNotifications,
      label: notificationsInboxCopy.nav,
      badge: <NotificationBadge key={unread} userId={viewer.userId} initialCount={unread} />,
    },
  ];
  return (
    <AppShell
      area={isManager ? shellCopy.managerArea : shellCopy.coordinatorArea}
      nav={nav}
      toolbar={
        <BusinessUnitPicker operable={units.operable} selectedId={units.selected?.id ?? null} />
      }
      viewer={viewer}
    >
      {children}
    </AppShell>
  );
}
