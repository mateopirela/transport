import { adminCopy, documentOwnerTypeLabels, shellCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadQueueCounts } from '@/lib/verification/admin-queries';

const c = shellCopy.adminHome;
const a = adminCopy.home;

export const metadata: Metadata = { title: c.title };

export default async function AdminHomePage() {
  await requireAccess(paths.admin);
  const supabase = await createClient();
  const counts = supabase ? await loadQueueCounts(supabase) : null;
  const tiles = counts
    ? [
        { label: a.pendingCompanies, value: counts.companies },
        ...(['company', 'vehicle', 'operator'] as const).map((type) => ({
          label: a.pendingDocuments(documentOwnerTypeLabels[type]),
          value: counts.documents[type],
        })),
      ]
    : [];
  return (
    <>
      <PageHeading title={c.title} description={c.description} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="gap-2">
            <CardContent>
              <p className="font-serif text-4xl">{tile.value}</p>
              <p className="text-sm text-muted-foreground">{tile.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Link href={paths.adminQueue} className={buttonVariants({ variant: 'accent' })}>
        {a.openQueue}
      </Link>
    </>
  );
}
