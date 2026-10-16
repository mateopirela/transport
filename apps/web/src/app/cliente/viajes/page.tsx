import { clientTripsCopy, formatDate } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Pager } from '@/components/pager';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { Table } from '@/components/ui/table';
import { shipperContext } from '@/lib/loads/queries';
import { parsePage, withParams } from '@/lib/pagination';
import { paths, tripPath } from '@/lib/routing';
import { listCompanyTrips, TRIPS_PAGE_SIZE } from '@/lib/trips/queries';
import { parseTripsView, type TripsView } from '@/lib/trips/tracking';
import { cn } from '@/lib/utils';

const c = clientTripsCopy.list;

export const metadata: Metadata = { title: c.title };

const TABS: { view: TripsView; param: string | undefined; label: string }[] = [
  { view: 'active', param: undefined, label: c.tabs.active },
  { view: 'history', param: 'historial', label: c.tabs.history },
];

/** The shipper's trips: active ones and the history (B15). */
export default async function TripsPage({ searchParams }: PageProps<'/cliente/viajes'>) {
  const { supabase, companyId } = await shipperContext(paths.shipperTrips);
  const params = await searchParams;
  const view = parseTripsView(params.vista);
  const page = parsePage(params.p);
  const current = { vista: view === 'history' ? 'historial' : undefined, p: String(page) };
  const { rows, total } = await listCompanyTrips(supabase, companyId, { view, page });

  return (
    <>
      <PageHeading title={c.title} description={c.description} />

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.view}
            href={withParams(paths.shipperTrips, {}, { vista: tab.param })}
            aria-current={tab.view === view ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 hover:bg-muted',
              tab.view === view && 'border-accent bg-accent/10 text-accent',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? (view === 'active' ? c.emptyActive : c.emptyHistory) : ''}
        </p>
      ) : (
        <Table
          headers={[c.columns.route, c.columns.carrier, c.columns.pickup, c.columns.status, '']}
        >
          {rows.map((trip) => (
            <tr key={trip.id}>
              <td className="font-medium">
                {trip.load
                  ? `${trip.load.origin_city}, ${trip.load.origin_state} → ${trip.load.destination_city}, ${trip.load.destination_state}`
                  : ''}
              </td>
              <td>{trip.parties?.carrierName ?? ''}</td>
              <td className="whitespace-nowrap">
                {trip.load ? formatDate(trip.load.pickup_window_start) : ''}
              </td>
              <td>
                <TripStatusBadge status={trip.status} />
              </td>
              <td>
                <Link href={tripPath(trip.id)} className="text-accent hover:underline">
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
          pageSize={TRIPS_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.shipperTrips, current, { p: n })}
        />
      </div>
    </>
  );
}
