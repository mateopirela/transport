import {
  adminCopy,
  adminOpsCopy,
  documentOwnerTypeLabels,
  pilotKpiTiles,
  shellCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageSection } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
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

interface Stat {
  key: string;
  value: string | number;
  label: string;
  hint?: string | undefined;
}

/**
 * Figures in one white group (§2 U8): each one a cell with the number in
 * `title1` (tabular) and its `label`, separated by hairlines.
 */
function Stats({ stats }: { stats: readonly Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-separator lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.key} className="flex flex-col gap-1 bg-cell px-4 py-4">
          <dt className="order-2 text-label text-text-dim">{stat.label}</dt>
          <dd className="order-1 text-title1 text-text tabular-nums">{stat.value}</dd>
          {stat.hint && <dd className="order-3 text-footnote text-text-faint">{stat.hint}</dd>}
        </div>
      ))}
      {/* Blank cells close the last row, so the hairline grid never shows through. */}
      {Array.from({ length: (4 - (stats.length % 4)) % 4 }, (_, i) => (
        <div key={`blank-${i}`} aria-hidden className="hidden bg-cell lg:block" />
      ))}
      {stats.length % 2 === 1 && <div aria-hidden className="bg-cell lg:hidden" />}
    </dl>
  );
}

/** Admin home: the verification queue and the pilot indicators (producto §5). */
export default async function AdminHomePage() {
  await requireAccess(paths.admin);
  const supabase = await createClient();
  const [counts, summary] = supabase
    ? await Promise.all([loadQueueCounts(supabase), loadPilotSummary(supabase)])
    : [null, null];
  const queue: Stat[] = counts
    ? [
        { key: 'companies', label: a.pendingCompanies, value: counts.companies },
        ...(['company', 'vehicle', 'operator'] as const).map((type) => ({
          key: type,
          label: a.pendingDocuments(documentOwnerTypeLabels[type]),
          value: counts.documents[type],
        })),
      ]
    : [];
  const kpis = summary ? pilotKpiTiles(summary, serverRoadFactor()) : null;
  return (
    <>
      <PageHeader
        title={c.title}
        description={c.description}
        action={
          <Link href={paths.adminQueue} className={buttonVariants({ variant: 'primary' })}>
            {a.openQueue}
          </Link>
        }
      />
      <div className="space-y-12">
        {queue.length > 0 && <Stats stats={queue} />}

        <PageSection title={k.title} description={k.description}>
          {kpis ? <Stats stats={kpis} /> : <Notice tone="error">{k.unavailable}</Notice>}
        </PageSection>
      </div>
    </>
  );
}
