import {
  adminCopy,
  adminOpsCopy,
  documentOwnerTypeLabels,
  pilotKpiTiles,
  shellCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Notice } from '@/components/auth-forms';
import { PageHeading } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { loadPilotSummary } from '@/lib/admin/queries';
import { serverRoadFactor } from '@/lib/loads/queries';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadQueueCounts } from '@/lib/verification/admin-queries';

const c = shellCopy.adminHome;
const a = adminCopy.home;
const k = adminOpsCopy.kpis;

export const metadata: Metadata = { title: c.title };

function Tile({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <Card className="gap-2">
      <CardContent>
        <p className="font-serif text-4xl">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Admin home: the verification queue and the pilot indicators (producto §5). */
export default async function AdminHomePage() {
  await requireAccess(paths.admin);
  const supabase = await createClient();
  const [counts, summary] = supabase
    ? await Promise.all([loadQueueCounts(supabase), loadPilotSummary(supabase)])
    : [null, null];
  const tiles = counts
    ? [
        { label: a.pendingCompanies, value: counts.companies },
        ...(['company', 'vehicle', 'operator'] as const).map((type) => ({
          label: a.pendingDocuments(documentOwnerTypeLabels[type]),
          value: counts.documents[type],
        })),
      ]
    : [];
  const kpis = summary ? pilotKpiTiles(summary, serverRoadFactor()) : null;
  return (
    <>
      <PageHeading title={c.title} description={c.description} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </div>
      <Link href={paths.adminQueue} className={buttonVariants({ variant: 'accent' })}>
        {a.openQueue}
      </Link>

      <section className="mt-12 space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl">{k.title}</h2>
          <p className="text-sm text-muted-foreground">{k.description}</p>
        </div>
        {kpis ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((tile) => (
              <Tile key={tile.key} value={tile.value} label={tile.label} hint={tile.hint} />
            ))}
          </div>
        ) : (
          <Notice tone="error">{k.unavailable}</Notice>
        )}
      </section>
    </>
  );
}
