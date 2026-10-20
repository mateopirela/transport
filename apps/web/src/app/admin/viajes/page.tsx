import { adminOpsCopy, formatDate, TRIP_STATUSES, tripStatusLabels } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FilterBar } from '@/components/admin/filter-bar';
import { textLink } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { formatRoute, parseTripFilters } from '@/lib/admin/filters';
import { ADMIN_PAGE_SIZE, adminContext, listAdminTrips } from '@/lib/admin/queries';
import { withParams } from '@/lib/pagination';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.trips;
const col = adminOpsCopy.columns;

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
      <FilterBar action={paths.adminTrips} statuses={STATUSES} status={filters.status} />
      {rows.length === 0 ? (
        total === 0 && <Empty title={c.empty} />
      ) : (
        <Table headers={[col.route, col.shipper, col.carrier, col.pickup, col.status, '']}>
          {rows.map((trip) => {
            const openIncidents = trip.incidents.length;
            return (
              <tr key={trip.id}>
                <td className="font-semibold">{trip.load ? formatRoute(trip.load) : ''}</td>
                <td>{trip.shipper?.legal_name ?? ''}</td>
                <td>{trip.carrier?.legal_name ?? ''}</td>
                <td className="whitespace-nowrap tabular-nums">
                  {trip.load ? formatDate(trip.load.pickup_window_start) : ''}
                </td>
                <td className="space-y-1">
                  <TripStatusBadge status={trip.status} />
                  {openIncidents > 0 && (
                    <Link
                      href={paths.adminIncidents}
                      className="block text-footnote text-red-text underline-offset-4 hover:underline"
                    >
                      {c.openIncidents(openIncidents)}
                    </Link>
                  )}
                </td>
                <td>
                  <Link href={adminLoadPath(trip.load_id)} className={textLink}>
                    {c.openLoad}
                  </Link>
                </td>
              </tr>
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
