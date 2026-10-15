import { shellCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = shellCopy.adminHome;

export const metadata: Metadata = { title: c.title };

export default async function AdminHomePage() {
  await requireAccess(paths.admin);
  return (
    <>
      <PageHeading title={c.title} description={c.description} />
      <Notice tone="info">{c.comingSoon}</Notice>
    </>
  );
}
