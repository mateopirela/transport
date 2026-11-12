import {
  adminOpsCopy,
  adminPanelCopy,
  formatDate,
  LOAD_STATUSES,
  loadStatusLabels,
  uiCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FilterBar } from '@/components/admin/filter-bar';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { Pager } from '@/components/pager';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { formatRoute, parseLoadFilters } from '@/lib/admin/filters';
import { ADMIN_PAGE_SIZE, adminContext, listAdminLoads } from '@/lib/admin/queries';
import { withParams } from '@/lib/pagination';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.loads;
const col = adminOpsCopy.columns;
const l = adminPanelCopy.lists;

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
      <PageHeader title={c.title} description={c.description} />
      <FilterBar
        action={paths.adminLoads}
        statuses={STATUSES}
        status={filters.status}
        city={filters.city}
        count={l.count(total, ...l.loads)}
      />
      {rows.length === 0 ? (
        total === 0 && <Empty title={c.empty} />
      ) : (
        <Table
          cards
          headers={[
            col.route,
            col.shipper,
            col.carrier,
            col.pickup,
            { label: col.price, align: 'right' },
            col.status,
            { label: uiCopy.actions, srOnly: true },
          ]}
        >
          {rows.map((load) => (
            <TableRow key={load.id}>
              <TableCell primary>{formatRoute(load)}</TableCell>
              <TableCell label={col.shipper}>{load.shipper?.legal_name ?? ''}</TableCell>
              <TableCell label={col.carrier} className="text-text-dim">
                {load.carrier?.legal_name ?? '—'}
              </TableCell>
              <TableCell label={col.pickup} className="whitespace-nowrap tabular-nums">
                {formatDate(load.pickup_window_start)}
              </TableCell>
              <TableCell label={col.price} numeric>
                <Money cents={load.agreed_price_cents ?? load.proposed_price_cents} />
              </TableCell>
              <TableCell label={col.status}>
                <LoadStatusBadge status={load.status} />
              </TableCell>
              <TableCell action>
                <Link
                  href={adminLoadPath(load.id)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  {c.open}
                </Link>
              </TableCell>
            </TableRow>
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
