import { clientTripsCopy, loadsCopy, notificationsInboxCopy, shellCopy } from '@transport/shared';
import { Bell, Package, Route } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Cell } from '@/components/ui/cell';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = loadsCopy.home;

export const metadata: Metadata = { title: shellCopy.shipperHome.title };

/** The shipper's start: the company, its one primary (publish) and the ways in. */
export default async function ShipperHomePage() {
  const viewer = await requireAccess(paths.shipper);
  return (
    <>
      <PageHeader
        title={viewer.company?.legalName ?? shellCopy.shipperHome.title}
        description={c.description}
        action={
          <Link href={paths.newLoad} className={buttonVariants()}>
            {c.cta}
          </Link>
        }
      />
      <Group className="max-w-xl">
        <Cell href={paths.shipperLoads} icon={Package} title={c.seeLoads} />
        <Cell href={paths.shipperTrips} icon={Route} title={clientTripsCopy.list.title} />
        <Cell href={paths.shipperNotifications} icon={Bell} title={notificationsInboxCopy.title} />
      </Group>
    </>
  );
}
