import {
  adminOpsCopy,
  adminPanelCopy,
  formatDate,
  supportCopy,
  TRIP_STATUSES,
  tripFolio,
  tripStatusLabels,
  uiCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FilterBar } from '@/components/admin/filter-bar';
import { Pager } from '@/components/pager';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { formatRoute, parseTripFilters } from '@/lib/admin/filters';
import { ADMIN_PAGE_SIZE, adminContext, listAdminTrips } from '@/lib/admin/queries';
import { withParams } from '@/lib/pagination';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.trips;
const col = adminOpsCopy.columns;
const l = adminPanelCopy.lists;

export const metadata: Metadata = { title: c.title };

const STATUSES = TRIP_STATUSES.map((value) => ({ value, label: tripStatusLabels[value] }));

/** Every trip of the platform, filtered by status, with its open incidents (B16). */
export default async function AdminTripsPage({ searchParams }: PageProps<'/admin/viajes'>) {
  const supabase = await adminContext(paths.adminTrips);
  const filters = parseTripFilters(await searchParams);
  const { rows, total } = await listAdminTrips(supabase, filters);

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <FilterBar
        action={paths.adminTrips}
        statuses={STATUSES}
        status={filters.status}
        count={l.count(total, ...l.trips)}
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
            col.status,
            { label: uiCopy.actions, srOnly: true },
          ]}
        >
          {rows.map((trip) => {
            const openIncidents = trip.incidents.length;
            return (
              <TableRow key={trip.id}>
                <TableCell primary>
                  <span className="block">{trip.load ? formatRoute(trip.load) : ''}</span>
                  {/* The folio "Ayuda" sends by WhatsApp (I2), so support finds the trip. */}
                  <span className="block text-meta font-normal text-text-dim">
                    {supportCopy.folio(tripFolio(trip.id) ?? '')}
                  </span>
                </TableCell>
                <TableCell label={col.shipper}>{trip.shipper?.legal_name ?? ''}</TableCell>
                <TableCell label={col.carrier}>{trip.carrier?.legal_name ?? ''}</TableCell>
                <TableCell label={col.pickup} className="whitespace-nowrap tabular-nums">
                  {trip.load ? formatDate(trip.load.pickup_window_start) : ''}
                </TableCell>
                <TableCell label={col.status}>
                  <span className="flex flex-wrap items-center gap-2">
                    <TripStatusBadge status={trip.status} />
                    {openIncidents > 0 && (
                      <Link href={paths.adminIncidents} className="rounded-sm">
                        <Tag tone="problem">{c.openIncidents(openIncidents)}</Tag>
                      </Link>
                    )}
                  </span>
                </TableCell>
                <TableCell action>
                  <Link
                    href={adminLoadPath(trip.load_id)}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    {c.openLoad}
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </Table>
      )}
      <div className="mt-4">
        <Pager
          page={filters.page}
          pageSize={ADMIN_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.adminTrips, { estado: filters.status }, { p: n })}
        />
      </div>
    </>
  );
}
