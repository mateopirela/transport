import { carrierTripsCopy, carrierWebCopy, formatDate } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Pager } from '@/components/pager';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import {
  CARRIER_TRIPS_VIEWS,
  parseCarrierTripsView,
  parseTripsBusinessUnit,
  TRIP_FILTER_PARAMS,
  TRIP_VIEW_PARAMS,
} from '@/lib/carrier/trip-filters';
import { CARRIER_TRIPS_PAGE_SIZE, listCarrierTrips } from '@/lib/carrier/trips';
import { parsePage, withParams } from '@/lib/pagination';
import { carrierTripPath, paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = carrierWebCopy.trips;

export const metadata: Metadata = { title: c.title };

/**
 * Won trips of the selected business units (G10b; B20 on the app): every
 * open one, or one section (to assign, upcoming, on the road) or the
 * history. `unidad` narrows the list to one business unit (the Gerente's
 * home links it so in G4).
 */
export default async function CarrierTripsPage({
  searchParams,
}: PageProps<'/transportista/viajes'>) {
  const { supabase, companyId, units } = await carrierContext(paths.carrierTrips);
  const params = await searchParams;
  const view = parseCarrierTripsView(params);
  const page = parsePage(params.p);
  const businessUnitId = parseTripsBusinessUnit(
    params,
    units.operable.map((u) => u.id),
  );
  const current = {
    [TRIP_FILTER_PARAMS.view]: TRIP_VIEW_PARAMS[view],
    [TRIP_FILTER_PARAMS.businessUnit]: businessUnitId ?? undefined,
    p: String(page),
  };
  const { rows, total } = await listCarrierTrips(supabase, companyId, {
    businessUnitIds: businessUnitId ? [businessUnitId] : units.ids,
    view,
    page,
  });
  const narrowed = units.operable.find((u) => u.id === businessUnitId);

  return (
    <>
      <PageHeading title={c.title} description={c.description} />

      {narrowed && (
        <p className="mb-4 text-sm">
          <span className="font-medium">{c.forBusinessUnit(narrowed.name)}</span>{' '}
          <Link
            href={withParams(paths.carrierTrips, current, {
              [TRIP_FILTER_PARAMS.businessUnit]: undefined,
              p: undefined,
            })}
            className="text-accent hover:underline"
          >
            {c.allBusinessUnits}
          </Link>
        </p>
      )}

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {CARRIER_TRIPS_VIEWS.map((tab) => (
          <Link
            key={tab}
            href={withParams(paths.carrierTrips, current, {
              [TRIP_FILTER_PARAMS.view]: TRIP_VIEW_PARAMS[tab],
              p: undefined,
            })}
            aria-current={tab === view ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 hover:bg-muted',
              tab === view && 'border-accent bg-accent/10 text-accent',
            )}
          >
            {c.tabs[tab]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? (view === 'open' ? c.emptyOpen : carrierTripsCopy.list.empty[view]) : ''}
        </p>
      ) : (
        <Table
          headers={[
            c.columns.route,
            c.columns.businessUnit,
            c.columns.pickup,
            c.columns.assignment,
            c.columns.status,
            c.columns.actions,
          ]}
        >
          {rows.map((trip) => (
            <tr key={trip.id}>
              <td className="font-medium">
                {trip.load
                  ? carrierTripsCopy.list.route(
                      `${trip.load.origin_city}, ${trip.load.origin_state}`,
                      `${trip.load.destination_city}, ${trip.load.destination_state}`,
                    )
                  : ''}
              </td>
              <td>{trip.businessUnitName ?? ''}</td>
              <td className="whitespace-nowrap">
                {trip.load ? formatDate(trip.load.pickup_window_start) : ''}
              </td>
              <td>
                {trip.unitName && trip.operatorName ? (
                  carrierTripsCopy.list.assignedTo(trip.unitName, trip.operatorName)
                ) : (
                  <span className="text-muted-foreground">{carrierTripsCopy.list.unassigned}</span>
                )}
              </td>
              <td>
                <TripStatusBadge status={trip.status} />
              </td>
              <td>
                <Link href={carrierTripPath(trip.id)} className="text-accent hover:underline">
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
          pageSize={CARRIER_TRIPS_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.carrierTrips, current, { p: n })}
        />
      </div>
    </>
  );
}
