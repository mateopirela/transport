import {
  carrierLoadsCopy,
  carrierWebCopy,
  chatCopy,
  fleetCopy,
  unitLabel,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeading } from '@/components/app-shell';
import { LoadDetails, loadRoute } from '@/components/carrier/load-details';
import { CarrierNegotiationPanel } from '@/components/carrier/negotiation-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { buttonVariants } from '@/components/ui/button';
import { carrierContext } from '@/lib/carrier/context';
import { getCarrierNegotiation, listCarrierUnits } from '@/lib/carrier/loads';
import { findCarrierTripId } from '@/lib/carrier/trips';
import { getChat } from '@/lib/chat/queries';
import { carrierLoadPath, carrierNegotiationPath, carrierTripPath, paths } from '@/lib/routing';

const c = carrierWebCopy.negotiations;

export const metadata: Metadata = { title: c.title };

/**
 * One negotiation of the company (G10a): the offer chain with the carrier's
 * actions and the chat with the shipper. The load may no longer be visible
 * (contracted with another carrier): the history and the chat stay.
 */
export default async function CarrierNegotiationPage({
  params,
}: PageProps<'/transportista/negociaciones/[id]'>) {
  const { id } = await params;
  const { supabase, viewer, companyId, units } = await carrierContext(carrierNegotiationPath(id));
  const negotiation = await getCarrierNegotiation(supabase, companyId, id);
  if (!negotiation) notFound();
  const { load } = negotiation;
  const [carrierUnits, chat, tripId] = await Promise.all([
    listCarrierUnits(supabase, companyId, [negotiation.businessUnitId]),
    negotiation.conversationId
      ? getChat(supabase, negotiation.conversationId, companyId)
      : Promise.resolve(null),
    // The company's trip of a won negotiation (G10b); RLS hides anyone else's.
    findCarrierTripId(supabase, companyId, negotiation.loadId),
  ]);
  const unitName = units.operable.find((u) => u.id === negotiation.businessUnitId)?.name;

  return (
    <>
      <RealtimeRefresh table="offers" column="negotiation_id" value={negotiation.id} />
      <Link href={paths.carrierNegotiations} className="text-sm text-accent hover:underline">
        {c.back}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={c.title2(load ? loadRoute(load) : c.unavailableLoad)}
          description={unitName ? fleetCopy.businessUnit(unitName) : undefined}
        />
        <div className="flex items-center gap-3 text-sm">
          {load && <LoadStatusBadge status={load.status} />}
          {tripId && (
            <Link href={carrierTripPath(tripId)} className="text-accent hover:underline">
              {carrierWebCopy.trips.seeTrip}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-6">
          {load && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl">{carrierWebCopy.detail.details}</h2>
                <Link
                  href={carrierLoadPath(load.id)}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  {c.seeLoad}
                </Link>
              </div>
              <LoadDetails load={load} />
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-2xl">{carrierLoadsCopy.chat.title}</h2>
            {chat && negotiation.conversationId ? (
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
            load={
              load && {
                id: load.id,
                status: load.status,
                proposedPriceCents: load.proposed_price_cents,
              }
            }
            offers={negotiation.offers}
            units={carrierUnits.map((u) => ({
              id: u.id,
              label: unitLabel(u),
              businessUnitId: u.business_unit_id,
            }))}
            businessUnits={units.operable}
            defaultVehicleId={null}
            defaultBusinessUnitId={negotiation.businessUnitId}
            negotiationBusinessUnitId={negotiation.businessUnitId}
          />
        </aside>
      </div>
    </>
  );
}
