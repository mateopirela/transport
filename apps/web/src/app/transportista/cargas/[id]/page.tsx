import {
  carrierLoadsCopy,
  carrierWebCopy,
  chatCopy,
  formatDistance,
  unitLabel,
  uuidField,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { LoadDetails, loadRoute } from '@/components/carrier/load-details';
import { CarrierNegotiationPanel } from '@/components/carrier/negotiation-panel';
import { RECOMMENDED_UNIT_PARAM } from '@/components/carrier/recommendation-card';
import { ChatPanel } from '@/components/chat/chat-panel';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { RouteMap } from '@/components/loads/route-map';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { carrierContext } from '@/lib/carrier/context';
import {
  emptyLegs,
  getCarrierLoad,
  getLoadNegotiation,
  listCarrierUnits,
} from '@/lib/carrier/loads';
import { getChat } from '@/lib/chat/queries';
import { serverRoadFactor } from '@/lib/loads/queries';
import { carrierLoadPath, paths } from '@/lib/routing';

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
  const back = (
    <Link href={paths.carrierLoads} className="text-sm text-accent hover:underline">
      {c.back}
    </Link>
  );
  if (!load) {
    return (
      <>
        {back}
        <div className="mt-4">
          <Notice tone="info">{c.notFound}</Notice>
        </div>
      </>
    );
  }
  // Compatible units nearest first; the unit it was recommended for leads.
  const legs = await emptyLegs(supabase, load, carrierUnits, { negotiated: negotiation !== null });
  const preferred = recommendedFor.success ? recommendedFor.data : null;
  legs.sort((a, b) => Number(b.vehicleId === preferred) - Number(a.vehicleId === preferred));
  const best = legs[0];
  // Only a unit the matching vetted (ready, compatible, free in time) is
  // proposed by default; an availability estimate just informs the distance.
  const defaultUnit = legs.find((leg) => leg.source === 'matching')?.vehicleId ?? null;
  const labels = new Map(carrierUnits.map((u) => [u.id, unitLabel(u)]));
  const chat = negotiation?.conversationId
    ? await getChat(supabase, negotiation.conversationId, companyId)
    : null;

  return (
    <>
      <RealtimeRefresh table="offers" column="load_id" value={load.id} />
      {back}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={loadRoute(load)}
          description={`${load.origin_city}, ${load.origin_state} → ${load.destination_city}, ${load.destination_state}`}
        />
        <LoadStatusBadge status={load.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-2xl">{c.route}</h2>
            <RouteMap
              origin={{ lat: load.origin_lat, lng: load.origin_lng, label: load.origin_city }}
              destination={{
                lat: load.destination_lat,
                lng: load.destination_lng,
                label: load.destination_city,
              }}
              roadFactor={serverRoadFactor()}
            />
            <p className="text-sm text-muted-foreground">
              {best
                ? c.emptyLeg(
                    formatDistance(best.emptyKm),
                    labels.get(best.vehicleId) ?? '',
                    best.start.city,
                  )
                : c.emptyLegUnknown}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{c.details}</h2>
            <LoadDetails load={load} />
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{carrierLoadsCopy.chat.title}</h2>
            {chat && negotiation?.conversationId ? (
              <>
                <p className="text-sm text-muted-foreground">{chatCopy.description}</p>
                <ChatPanel
                  conversationId={negotiation.conversationId}
                  viewerId={viewer.userId}
                  ownCompanyUserIds={chat.ownCompanyUserIds}
                  initialMessages={chat.messages}
                  initialReads={chat.reads}
                  area="transportista"
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{carrierLoadsCopy.chat.unavailable}</p>
            )}
          </section>
        </div>

        <aside className="space-y-3">
          <h2 className="text-2xl">{carrierWebCopy.offer.title}</h2>
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
