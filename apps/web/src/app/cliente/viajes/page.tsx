import { clientListsCopy, clientTripsCopy, formatDate } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { rowLink } from '@/components/ui/panel';
import { Pager } from '@/components/pager';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { shipperContext } from '@/lib/loads/queries';
import { parsePage, withParams } from '@/lib/pagination';
import { paths, tripPath } from '@/lib/routing';
import { listCompanyTrips, TRIPS_PAGE_SIZE } from '@/lib/trips/queries';
import { parseTripsView, type TripsView } from '@/lib/trips/tracking';

const c = clientTripsCopy.list;

export const metadata: Metadata = { title: c.title };

const TABS: { value: TripsView; label: string; href: string }[] = [
  { value: 'active', label: c.tabs.active, href: withParams(paths.shipperTrips, {}, {}) },
  {
    value: 'history',
    label: c.tabs.history,
    href: withParams(paths.shipperTrips, {}, { vista: 'historial' }),
  },
];

/**
 * The shipper's trips: active ones and the history (B15), as a table (V3):
 * the route (the way into the trip), the carrier, the pickup and the status.
 */
export default async function TripsPage({ searchParams }: PageProps<'/cliente/viajes'>) {
  const { supabase, companyId } = await shipperContext(paths.shipperTrips);
  const params = await searchParams;
  const view = parseTripsView(params.vista);
  const page = parsePage(params.p);
  const current = { vista: view === 'history' ? 'historial' : undefined, p: String(page) };
  const { rows, total } = await listCompanyTrips(supabase, companyId, { view, page });
  const col = c.columns;

  return (
    <>
      <PageHeader title={c.title} description={c.description} />

      <Segmented label={c.title} value={view} items={TABS} className="mb-6" />

      {rows.length === 0 ? (
        total === 0 && (
          <Empty
            title={view === 'active' ? c.emptyActive : c.emptyHistory}
            description={view === 'active' ? clientListsCopy.trips.emptyHelp : undefined}
          />
        )
      ) : (
        <Table cards headers={[col.route, col.carrier, col.pickup, col.status]}>
          {rows.map((trip) => (
            <TableRow key={trip.id}>
              <TableCell primary>
                {/* One block, so the card of a phone keeps the states under the route. */}
                <div>
                  <Link href={tripPath(trip.id)} className={rowLink}>
                    {trip.load
                      ? `${trip.load.origin_city} → ${trip.load.destination_city}`
                      : c.open}
                  </Link>
                  {trip.load && (
                    <span className="block text-footnote font-normal text-text-dim">
                      {trip.load.origin_state} · {trip.load.destination_state}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell label={col.carrier}>{trip.parties?.carrierName}</TableCell>
              <TableCell label={col.pickup} className="whitespace-nowrap">
                {trip.load ? formatDate(trip.load.pickup_window_start) : null}
              </TableCell>
              <TableCell label={col.status}>
                <TripStatusBadge status={trip.status} />
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
      <div className="mt-4">
        <Pager
          page={page}
          pageSize={TRIPS_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.shipperTrips, current, { p: n })}
        />
      </div>
    </>
  );
}
