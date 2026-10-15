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

import { PageHeading } from '@/components/app-shell';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { Pager } from '@/components/pager';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { listCompanyLoads, LOADS_PAGE_SIZE, shipperContext } from '@/lib/loads/queries';
import { parseStatusFilter } from '@/lib/loads/status';
import { parsePage, withParams } from '@/lib/pagination';
import { loadPath, paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = loadsCopy.list;

export const metadata: Metadata = { title: c.title };

/** The shipper's loads, filterable by status (B13). */
export default async function LoadsPage({ searchParams }: PageProps<'/cliente/cargas'>) {
  const { supabase, companyId } = await shipperContext(paths.shipperLoads);
  const params = await searchParams;
  const status = parseStatusFilter(params.estado);
  const page = parsePage(params.p);
  const current = { estado: status ?? undefined, p: String(page) };
  const { rows, total } = await listCompanyLoads(supabase, companyId, { status, page });

  const filters = [
    { value: undefined, label: c.all },
    ...LOAD_STATUSES.map((value) => ({ value, label: loadStatusLabels[value] })),
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={c.title} description={c.description} />
        <Link href={paths.newLoad} className={buttonVariants({ variant: 'accent' })}>
          {c.newLoad}
        </Link>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {filters.map((filter) => (
          <Link
            key={filter.value ?? 'all'}
            href={withParams(paths.shipperLoads, {}, { estado: filter.value })}
            aria-current={filter.value === (status ?? undefined) ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 hover:bg-muted',
              filter.value === (status ?? undefined) && 'border-accent bg-accent/10 text-accent',
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{total === 0 ? c.empty : ''}</p>
      ) : (
        <Table
          headers={[
            c.columns.route,
            c.columns.pickup,
            c.columns.unit,
            c.columns.price,
            c.columns.status,
            '',
          ]}
        >
          {rows.map((load) => (
            <tr key={load.id}>
              <td className="font-medium">
                {load.origin_city}, {load.origin_state} → {load.destination_city},{' '}
                {load.destination_state}
              </td>
              <td className="whitespace-nowrap">{formatDate(load.pickup_window_start)}</td>
              <td>{unitTypeLabels[load.unit_type]}</td>
              <td className="whitespace-nowrap">{formatMxn(load.proposed_price_cents)}</td>
              <td>
                <LoadStatusBadge status={load.status} />
              </td>
              <td>
                <Link href={loadPath(load.id)} className="text-accent hover:underline">
                  {c.open}
                </Link>
              </td>
            </tr>
          ))}
        </Table>
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
