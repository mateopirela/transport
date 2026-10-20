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

import { LoadDetails, loadRoute } from '@/components/carrier/load-details';
import { CarrierNegotiationPanel } from '@/components/carrier/negotiation-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { BackLink, PageSection } from '@/components/page-section';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
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
  const small = buttonVariants({ variant: 'secondary', size: 'sm' });

  return (
    <>
      <RealtimeRefresh table="offers" column="negotiation_id" value={negotiation.id} />
      <BackLink href={paths.carrierNegotiations}>{c.back}</BackLink>
      <PageHeader
        title={c.title2(load ? loadRoute(load) : c.unavailableLoad)}
        status={load && <LoadStatusBadge status={load.status} />}
        description={unitName ? fleetCopy.businessUnit(unitName) : undefined}
        action={
          tripId && (
            <Link href={carrierTripPath(tripId)} className={small}>
              {carrierWebCopy.trips.seeTrip}
            </Link>
          )
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          {load && (
            <PageSection
              title={carrierWebCopy.detail.details}
              action={
                <Link href={carrierLoadPath(load.id)} className={small}>
                  {c.seeLoad}
                </Link>
              }
            >
              <LoadDetails load={load} />
            </PageSection>
          )}

          <PageSection
            title={carrierLoadsCopy.chat.title}
            description={chat && negotiation.conversationId ? chatCopy.description : undefined}
          >
            {chat && negotiation.conversationId ? (
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
