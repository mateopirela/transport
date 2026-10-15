import { shellCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = shellCopy.shipperHome;

export const metadata: Metadata = { title: c.title };

export default async function ShipperHomePage() {
  const viewer = await requireAccess(paths.shipper);
  return (
    <>
      <PageHeading title={viewer.company?.legalName ?? c.title} description={c.description} />
      <Notice tone="info">{c.comingSoon}</Notice>
    </>
  );
}
