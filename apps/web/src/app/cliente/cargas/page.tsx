import {
  formatDate,
  formatMxn,
  LOAD_STATUSES,
  loadsCopy,
  loadStatusLabels,
  unitTypeLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { Pager } from '@/components/pager';
import { buttonVariants } from '@/components/ui/button';
import { Cell } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { listCompanyLoads, LOADS_PAGE_SIZE, shipperContext } from '@/lib/loads/queries';
import { parseStatusFilter } from '@/lib/loads/status';
import { parsePage, withParams } from '@/lib/pagination';
import { loadPath, paths } from '@/lib/routing';

const c = loadsCopy.list;

export const metadata: Metadata = { title: c.title };

/** The shipper's loads, filterable by status (B13): one cell per load, its status as a pill. */
export default async function LoadsPage({ searchParams }: PageProps<'/cliente/cargas'>) {
  const { supabase, companyId } = await shipperContext(paths.shipperLoads);
  const params = await searchParams;
  const status = parseStatusFilter(params.estado);
  const page = parsePage(params.p);
  const current = { estado: status ?? undefined, p: String(page) };
  const { rows, total } = await listCompanyLoads(supabase, companyId, { status, page });

  const filters = [
    { value: 'all', label: c.all, href: withParams(paths.shipperLoads, {}, {}) },
    ...LOAD_STATUSES.map((value) => ({
      value,
      label: loadStatusLabels[value],
      href: withParams(paths.shipperLoads, {}, { estado: value }),
    })),
  ];

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.description}
        action={
          <Link href={paths.newLoad} className={buttonVariants()}>
            {c.newLoad}
          </Link>
        }
      />

      <Segmented label={c.title} value={status ?? 'all'} items={filters} className="mb-6" />

      {rows.length === 0 ? (
        total === 0 && <Empty title={c.empty} />
      ) : (
        <Group>
          {rows.map((load) => (
            <Cell
              key={load.id}
              href={loadPath(load.id)}
              title={`${load.origin_city}, ${load.origin_state} → ${load.destination_city}, ${load.destination_state}`}
              subtitle={[
                `${c.columns.pickup} ${formatDate(load.pickup_window_start)}`,
                unitTypeLabels[load.unit_type],
                formatMxn(load.proposed_price_cents),
              ].join(' · ')}
              trailing={<LoadStatusBadge status={load.status} />}
            />
          ))}
        </Group>
      )}
      <div className="mt-4">
        <Pager
          page={page}
          pageSize={LOADS_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.shipperLoads, current, { p: n })}
        />
      </div>
    </>
  );
}
