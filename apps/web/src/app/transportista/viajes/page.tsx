import {
  carrierTripsCopy,
  carrierWebCopy,
  formatDate,
  INTERNAL_CHAT_PARAM,
  internalChatCopy,
} from '@transport/shared';
import { MessageCircle, Route } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { textLink } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Segmented } from '@/components/ui/segmented';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { carrierContext } from '@/lib/carrier/context';
import {
  CARRIER_TRIPS_VIEWS,
  parseCarrierTripsView,
  parseTripsBusinessUnit,
  TRIP_FILTER_PARAMS,
  TRIP_VIEW_PARAMS,
} from '@/lib/carrier/trip-filters';
import {
  CARRIER_TRIPS_PAGE_SIZE,
  internalUnreadByTrip,
  listCarrierTrips,
} from '@/lib/carrier/trips';
import { parsePage, withParams } from '@/lib/pagination';
import { carrierTripPath, paths } from '@/lib/routing';

const c = carrierWebCopy.trips;

/** Unread messages of the trip's internal chat (H1): a link to its "Interno" tab. */
function UnreadBadge({ tripId, count }: { tripId: string; count: number }) {
  if (count === 0) return null;
  return (
    <Link
      href={`${carrierTripPath(tripId)}?chat=${INTERNAL_CHAT_PARAM}`}
      aria-label={internalChatCopy.unreadLabel(count)}
      title={internalChatCopy.unreadLabel(count)}
      className="inline-flex align-middle"
    >
      <Pill tone="attention">
        <MessageCircle aria-hidden className="size-3" />
        {internalChatCopy.unreadBadge(count)}
      </Pill>
    </Link>
  );
}

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
  const unread = await internalUnreadByTrip(
    supabase,
    rows.map((trip) => trip.id),
  );
  const narrowed = units.operable.find((u) => u.id === businessUnitId);

  return (
    <>
      <PageHeader title={c.title} description={c.description} />

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented
          label={c.title}
          value={view}
          items={CARRIER_TRIPS_VIEWS.map((tab) => ({
            value: tab,
            label: c.tabs[tab],
            href: withParams(paths.carrierTrips, current, {
              [TRIP_FILTER_PARAMS.view]: TRIP_VIEW_PARAMS[tab],
              p: undefined,
            }),
          }))}
        />
        {narrowed && (
          <div className="flex flex-wrap items-center gap-1">
            <Pill>{c.forBusinessUnit(narrowed.name)}</Pill>
            <Link
              href={withParams(paths.carrierTrips, current, {
                [TRIP_FILTER_PARAMS.businessUnit]: undefined,
                p: undefined,
              })}
              className={buttonVariants({ variant: 'plain', size: 'sm' })}
            >
              {c.allBusinessUnits}
            </Link>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        total === 0 && (
          <Empty
            icon={Route}
            title={view === 'open' ? c.emptyOpen : carrierTripsCopy.list.empty[view]}
          />
        )
      ) : (
        <Table
          cards
          headers={[
            c.columns.route,
            c.columns.businessUnit,
            c.columns.pickup,
            c.columns.assignment,
            c.columns.status,
            { label: c.open, srOnly: true },
          ]}
        >
          {rows.map((trip) => (
            <TableRow key={trip.id}>
              <TableCell primary>
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {trip.load
                      ? carrierTripsCopy.list.route(
                          `${trip.load.origin_city}, ${trip.load.origin_state}`,
                          `${trip.load.destination_city}, ${trip.load.destination_state}`,
                        )
                      : ''}
                  </span>
                  <UnreadBadge tripId={trip.id} count={unread.get(trip.id) ?? 0} />
                </span>
              </TableCell>
              <TableCell label={c.columns.businessUnit} className="text-text-dim">
                {trip.businessUnitName ?? ''}
              </TableCell>
              <TableCell label={c.columns.pickup} className="text-meta whitespace-nowrap">
                {trip.load ? formatDate(trip.load.pickup_window_start) : ''}
              </TableCell>
              <TableCell label={c.columns.assignment}>
                {trip.unitName && trip.operatorName ? (
                  carrierTripsCopy.list.assignedTo(trip.unitName, trip.operatorName)
                ) : (
                  <Tag tone="pending">{carrierTripsCopy.list.unassigned}</Tag>
                )}
              </TableCell>
              <TableCell label={c.columns.status}>
                <TripStatusBadge status={trip.status} />
              </TableCell>
              <TableCell action>
                <Link href={carrierTripPath(trip.id)} className={textLink}>
                  {c.open}
                </Link>
              </TableCell>
            </TableRow>
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
