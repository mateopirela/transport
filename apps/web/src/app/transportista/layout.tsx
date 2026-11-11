import {
  billingCopy,
  carrierWebCopy,
  freightCopy,
  managerCompanyCopy,
  navCopy,
  notificationsInboxCopy,
  shellCopy,
} from '@transport/shared';
import {
  Bell,
  Building2,
  CreditCard,
  Handshake,
  House,
  Package,
  Route,
  Truck,
  Wallet,
} from 'lucide-react';

import { AppShell, type ShellNavGroup } from '@/components/app-shell';
import { BillingBanner } from '@/components/billing/billing-banner';
import { BusinessUnitPicker } from '@/components/carrier/business-unit-picker';
import { NotificationBadge } from '@/components/notifications/notification-badge';
import { loadBillingState } from '@/lib/billing/queries';
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
  const { supabase, viewer, units, isManager } = await carrierContext(paths.carrier);
  const [unread, billing] = await Promise.all([
    unreadNotificationCount(viewer.userId),
    // The banner never takes the carrier area down.
    loadBillingState(supabase).catch(() => null),
  ]);
  const groups: ShellNavGroup[] = [
    {
      items: [{ href: paths.carrier, label: carrierWebCopy.nav.home, icon: <House aria-hidden /> }],
    },
    {
      label: navCopy.groups.operation,
      items: [
        {
          href: paths.carrierLoads,
          label: carrierWebCopy.nav.loads,
          icon: <Package aria-hidden />,
        },
        {
          href: paths.carrierNegotiations,
          label: carrierWebCopy.nav.negotiations,
          icon: <Handshake aria-hidden />,
        },
        { href: paths.carrierTrips, label: carrierWebCopy.nav.trips, icon: <Route aria-hidden /> },
      ],
    },
    {
      label: navCopy.groups.company,
      items: [
        {
          href: paths.carrierUnits,
          match: paths.carrierFleet,
          label: carrierWebCopy.nav.fleet,
          icon: <Truck aria-hidden />,
        },
        {
          href: paths.carrierCollections,
          label: freightCopy.collections.title,
          icon: <Wallet aria-hidden />,
        },
        ...(isManager
          ? [
              {
                href: paths.carrierCompany,
                label: managerCompanyCopy.title,
                icon: <Building2 aria-hidden />,
              },
            ]
          : []),
        {
          href: paths.carrierSubscription,
          label: billingCopy.title,
          icon: <CreditCard aria-hidden />,
        },
      ],
    },
    {
      items: [
        {
          href: paths.carrierNotifications,
          label: notificationsInboxCopy.nav,
          icon: <Bell aria-hidden />,
          badge: <NotificationBadge key={unread} userId={viewer.userId} initialCount={unread} />,
        },
      ],
    },
  ];
  return (
    <AppShell
      area={isManager ? shellCopy.managerArea : shellCopy.coordinatorArea}
      groups={groups}
      toolbar={
        <BusinessUnitPicker operable={units.operable} selectedId={units.selected?.id ?? null} />
      }
      viewer={viewer}
    >
      <BillingBanner state={billing} />
      {children}
    </AppShell>
  );
}
