import { clientTripsCopy, formatDate } from '@transport/shared';
import type { Metadata } from 'next';

import { Pager } from '@/components/pager';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { Cell } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
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

/** The shipper's trips: active ones and the history (B15), one cell per trip. */
export default async function TripsPage({ searchParams }: PageProps<'/cliente/viajes'>) {
  const { supabase, companyId } = await shipperContext(paths.shipperTrips);
  const params = await searchParams;
  const view = parseTripsView(params.vista);
  const page = parsePage(params.p);
  const current = { vista: view === 'history' ? 'historial' : undefined, p: String(page) };
  const { rows, total } = await listCompanyTrips(supabase, companyId, { view, page });

  return (
    <>
      <PageHeader title={c.title} description={c.description} />

      <Segmented label={c.title} value={view} items={TABS} className="mb-6" />

      {rows.length === 0 ? (
        total === 0 && <Empty title={view === 'active' ? c.emptyActive : c.emptyHistory} />
      ) : (
        <Group>
          {rows.map((trip) => (
            <Cell
              key={trip.id}
              href={tripPath(trip.id)}
              title={
                trip.load
                  ? `${trip.load.origin_city}, ${trip.load.origin_state} → ${trip.load.destination_city}, ${trip.load.destination_state}`
                  : ''
              }
              subtitle={[
                trip.parties?.carrierName,
                trip.load
                  ? `${c.columns.pickup} ${formatDate(trip.load.pickup_window_start)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={<TripStatusBadge status={trip.status} />}
            />
          ))}
        </Group>
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
