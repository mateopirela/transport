import {
  adminOpsCopy,
  formatDate,
  formatMxn,
  LOAD_STATUSES,
  loadStatusLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FilterBar } from '@/components/admin/filter-bar';
import { PageHeading } from '@/components/app-shell';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { Pager } from '@/components/pager';
import { Table } from '@/components/ui/table';
import { formatRoute, parseLoadFilters } from '@/lib/admin/filters';
import { ADMIN_PAGE_SIZE, adminContext, listAdminLoads } from '@/lib/admin/queries';
import { withParams } from '@/lib/pagination';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.loads;
const col = adminOpsCopy.columns;

export const metadata: Metadata = { title: c.title };

const STATUSES = LOAD_STATUSES.map((value) => ({ value, label: loadStatusLabels[value] }));

/** Every load of the platform, with status and city filters (B16). */
export default async function AdminLoadsPage({ searchParams }: PageProps<'/admin/cargas'>) {
  const supabase = await adminContext(paths.adminLoads);
  const filters = parseLoadFilters(await searchParams);
  const { rows, total } = await listAdminLoads(supabase, filters);
  const current = { estado: filters.status, ciudad: filters.city };

  return (
    <>
      <PageHeading title={c.title} description={c.description} />
      <FilterBar
        action={paths.adminLoads}
        statuses={STATUSES}
        status={filters.status}
        city={filters.city}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{total === 0 ? c.empty : ''}</p>
      ) : (
        <Table
          headers={[col.route, col.shipper, col.carrier, col.pickup, col.price, col.status, '']}
        >
          {rows.map((load) => (
            <tr key={load.id}>
              <td className="font-medium">{formatRoute(load)}</td>
              <td>{load.shipper?.legal_name ?? ''}</td>
              <td>{load.carrier?.legal_name ?? '—'}</td>
              <td className="whitespace-nowrap">{formatDate(load.pickup_window_start)}</td>
              <td className="whitespace-nowrap">
                {formatMxn(load.agreed_price_cents ?? load.proposed_price_cents)}
              </td>
              <td>
                <LoadStatusBadge status={load.status} />
              </td>
              <td>
                <Link href={adminLoadPath(load.id)} className="text-accent hover:underline">
                  {c.open}
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <div className="mt-4">
        <Pager
          page={filters.page}
          pageSize={ADMIN_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.adminLoads, current, { p: n })}
        />
      </div>
    </>
  );
}
