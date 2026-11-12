import { clientListsCopy, LOAD_STATUSES, loadsCopy, loadStatusLabels } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { LoadsTable } from '@/components/client/loads-table';
import { Pager } from '@/components/pager';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { listCompanyLoads, LOADS_PAGE_SIZE, shipperContext } from '@/lib/loads/queries';
import { parseStatusFilter } from '@/lib/loads/status';
import { parsePage, withParams } from '@/lib/pagination';
import { paths } from '@/lib/routing';

const c = loadsCopy.list;

export const metadata: Metadata = { title: c.title };

/**
 * The shipper's loads, filterable by status (B13), as a table (V3): the
 * route, the pickup, the unit, the price and the status. "Publicar carga" is
 * the one primary, in the header.
 */
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
        total === 0 &&
        (status ? (
          <Empty
            title={clientListsCopy.loads.emptyFiltered}
            action={
              <Link href={paths.shipperLoads} className={buttonVariants({ variant: 'secondary' })}>
                {clientListsCopy.loads.seeAll}
              </Link>
            }
          />
        ) : (
          <Empty title={c.empty} description={clientListsCopy.loads.emptyHelp} />
        ))
      ) : (
        <LoadsTable rows={rows} />
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
