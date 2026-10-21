import {
  carrierLoadsCopy,
  carrierWebCopy,
  chatCopy,
  defaultAxleCount,
  formatDistance,
  roadsCopy,
  suggestLoadRoad,
  unitLabel,
  uuidField,
  vehicleAxles,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { LoadDetails, loadRoute } from '@/components/carrier/load-details';
import { CarrierNegotiationPanel } from '@/components/carrier/negotiation-panel';
import { RECOMMENDED_UNIT_PARAM } from '@/components/carrier/recommendation-card';
import { SuggestedRoute } from '@/components/carrier/suggested-route';
import { ChatPanel } from '@/components/chat/chat-panel';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { RouteMap } from '@/components/loads/route-map';
import { BackLink, PageSection } from '@/components/page-section';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { buttonVariants } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { carrierContext } from '@/lib/carrier/context';
import {
  emptyLegs,
  getCarrierLoad,
  getLoadNegotiation,
  listCarrierUnits,
} from '@/lib/carrier/loads';
import { loadRoadContext } from '@/lib/carrier/roads';
import { findCarrierTripId } from '@/lib/carrier/trips';
import { getChat } from '@/lib/chat/queries';
import { siteDwellEstimate } from '@/lib/dwell';
import { serverRoadFactor } from '@/lib/loads/queries';
import { carrierLoadPath, carrierTripPath, paths } from '@/lib/routing';

const c = carrierWebCopy.detail;

export const metadata: Metadata = { title: carrierLoadsCopy.detail.title };

/**
 * Load detail for the carrier staff (G10a; B19 on the app): route with the
 * empty km of the nearest compatible unit, the negotiation of the company
 * (offer, counter, accept, reject, withdraw) and its chat, and the load's data.
 */
export default async function CarrierLoadPage({
  params,
  searchParams,
}: PageProps<'/transportista/cargas/[id]'>) {
  const { id } = await params;
  const { supabase, viewer, companyId, units } = await carrierContext(carrierLoadPath(id));
  const recommendedFor = uuidField.safeParse((await searchParams)[RECOMMENDED_UNIT_PARAM]);
  const [load, negotiation] = await Promise.all([
    getCarrierLoad(supabase, id),
    getLoadNegotiation(supabase, companyId, id),
  ]);
  // With a negotiation under way, only its business unit's units may be
  // proposed (make_offer, counter_offer), whatever the picker says.
  const carrierUnits = await listCarrierUnits(
    supabase,
    companyId,
    negotiation ? [negotiation.businessUnitId] : units.ids,
  );
  const back = <BackLink href={paths.carrierLoads}>{c.back}</BackLink>;
  if (!load) {
    return (
      <>
        {back}
        <Notice tone="info">{c.notFound}</Notice>
      </>
    );
  }
  // Compatible units nearest first; the unit it was recommended for leads.
  const legs = await emptyLegs(supabase, load, carrierUnits);
  const preferred = recommendedFor.success ? recommendedFor.data : null;
  legs.sort((a, b) => Number(b.vehicleId === preferred) - Number(a.vehicleId === preferred));
  const best = legs[0];
  // Only a unit the matching vetted (ready, compatible, free in time) is
  // proposed by default; an availability estimate just informs the distance.
  const defaultUnit = legs.find((leg) => leg.source === 'matching')?.vehicleId ?? null;
  const labels = new Map(carrierUnits.map((u) => [u.id, unitLabel(u)]));
  // H4: the suggested road for the unit that leads (its axles pick the toll class).
  const roadUnit = carrierUnits.find((u) => u.id === (best?.vehicleId ?? preferred));
  const [chat, tripId, roadContext, pickupDwell] = await Promise.all([
    negotiation?.conversationId
      ? getChat(supabase, negotiation.conversationId, companyId)
      : Promise.resolve(null),
    // The company's trip of a won load (G10b); RLS hides anyone else's.
    findCarrierTripId(supabase, companyId, load.id),
    loadRoadContext(supabase),
    // H5: the typical waiting and loading time at its pickup, at that hour.
    siteDwellEstimate(
      supabase,
      'pickup',
      { lat: load.origin_lat, lng: load.origin_lng },
      { at: new Date(load.pickup_window_start) },
    ),
  ]);
  const roadAxles = roadUnit ? vehicleAxles(roadUnit) : defaultAxleCount('tractor', null);
  const road = suggestLoadRoad(roadContext, load, roadAxles);

  return (
    <>
      <RealtimeRefresh table="offers" column="load_id" value={load.id} />
      {back}
      <PageHeader
        title={loadRoute(load)}
        status={<LoadStatusBadge status={load.status} />}
        description={`${load.origin_city}, ${load.origin_state} → ${load.destination_city}, ${load.destination_state}`}
        action={
          tripId && (
            <Link
              href={carrierTripPath(tripId)}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              {carrierWebCopy.trips.seeTrip}
            </Link>
          )
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          <PageSection title={c.route}>
            <RouteMap
              origin={{ lat: load.origin_lat, lng: load.origin_lng, label: load.origin_city }}
              destination={{
                lat: load.destination_lat,
                lng: load.destination_lng,
                label: load.destination_city,
              }}
              roadFactor={serverRoadFactor()}
            />
            <p className="px-1 text-subhead text-text-dim">
              {best
                ? c.emptyLeg(
                    formatDistance(best.emptyKm),
                    labels.get(best.vehicleId) ?? '',
                    best.start.city,
                  )
                : c.emptyLegUnknown}
            </p>
          </PageSection>

          <SuggestedRoute
            road={road}
            estimateFor={roadsCopy.estimateFor(roadUnit ? unitLabel(roadUnit) : null, roadAxles)}
            pickupDwell={pickupDwell}
          />

          <PageSection title={c.details}>
            <LoadDetails load={load} />
          </PageSection>

          <PageSection
            title={carrierLoadsCopy.chat.title}
            description={chat && negotiation?.conversationId ? chatCopy.description : undefined}
          >
            {chat && negotiation?.conversationId ? (
              <ChatPanel
                conversationId={negotiation.conversationId}
                viewerId={viewer.userId}
                ownCompanyUserIds={chat.ownCompanyUserIds}
                initialMessages={chat.messages}
                initialReads={chat.reads}
                area="transportista"
              />
            ) : (
              <p className="px-1 text-subhead text-text-dim">{carrierLoadsCopy.chat.unavailable}</p>
            )}
          </PageSection>
        </div>

        <aside className="space-y-3">
          <h2 className="px-1 text-title3 text-text">{carrierWebCopy.offer.title}</h2>
          <CarrierNegotiationPanel
            load={{
              id: load.id,
              status: load.status,
              proposedPriceCents: load.proposed_price_cents,
            }}
            offers={negotiation?.offers ?? []}
            units={carrierUnits.map((u) => ({
              id: u.id,
              label: unitLabel(u),
              businessUnitId: u.business_unit_id,
            }))}
            businessUnits={units.operable}
            defaultVehicleId={defaultUnit}
            defaultBusinessUnitId={units.selected?.id ?? null}
            negotiationBusinessUnitId={negotiation?.businessUnitId ?? null}
          />
        </aside>
      </div>
    </>
  );
}
