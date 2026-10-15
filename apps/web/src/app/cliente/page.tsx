import { loadsCopy, shellCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = loadsCopy.home;

export const metadata: Metadata = { title: shellCopy.shipperHome.title };

export default async function ShipperHomePage() {
  const viewer = await requireAccess(paths.shipper);
  return (
    <>
      <PageHeading
        title={viewer.company?.legalName ?? shellCopy.shipperHome.title}
        description={c.description}
      />
      <div className="flex flex-wrap gap-3">
        <Link href={paths.newLoad} className={buttonVariants({ variant: 'accent', size: 'lg' })}>
          {c.cta}
        </Link>
        <Link
          href={paths.shipperLoads}
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          {c.seeLoads}
        </Link>
      </div>
    </>
  );
}
