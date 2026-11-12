import {
  chatCopy,
  clientListsCopy,
  formatDateTime,
  formatMoney,
  offersCopy,
  offerStatusLabels,
  offerStatusReasonText,
} from '@transport/shared';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Notice } from '@/components/auth-forms';
import { ChatPanel } from '@/components/chat/chat-panel';
import { negotiationLabel, UnitSummary, VerificationBadge } from '@/components/offers/offer-board';
import { OfferResponse } from '@/components/offers/offer-response';
import { PageSection } from '@/components/page-section';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { ProviderStatusForm } from '@/components/shared-documents/provider-status';
import { buttonVariants } from '@/components/ui/button';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Group } from '@/components/ui/group';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { getChat } from '@/lib/chat/queries';
import { getCompanyLoad, shipperContext } from '@/lib/loads/queries';
import { findNegotiation, getOfferBoard } from '@/lib/offers/queries';
import { loadPath, negotiationPath } from '@/lib/routing';
import { getViewer } from '@/lib/session';
import { getProviderDecisions } from '@/lib/shared-documents/queries';
import { negotiationTone, offerStatusTone } from '@/lib/status-tones';
import { cn } from '@/lib/utils';

const c = offersCopy.negotiation;
const n = clientListsCopy.negotiation;

export const metadata: Metadata = { title: offersCopy.board.title };

/**
 * One negotiation of a load (V3): the chat and the history of offers on the
 * left; on the right a rail with the latest offer, its state and the buttons
 * that answer it (accept is the screen's one primary), and the unit.
 */
export default async function NegotiationPage({
  params,
}: PageProps<'/cliente/cargas/[id]/negociaciones/[negotiationId]'>) {
  const { id, negotiationId } = await params;
  const { supabase, companyId } = await shipperContext(negotiationPath(id, negotiationId));
  const found = await getCompanyLoad(supabase, companyId, id);
  // A load sent to the platform (I6) is negotiated by Transport, not the client.
  if (!found || found.brokered || found.proposed_price_cents === null) notFound();
  const load = { ...found, proposed_price_cents: found.proposed_price_cents };
  const board = await getOfferBoard(supabase, load);
  const row = findNegotiation(board, negotiationId);
  const viewer = await getViewer();
  if (!row || !viewer) notFound();
  const [chat, decisions] = await Promise.all([
    row.conversationId ? getChat(supabase, row.conversationId, companyId) : null,
    getProviderDecisions(supabase, {
      shipperCompanyId: companyId,
      carrierCompanyIds: [row.carrierCompanyId],
    }),
  ]);
  const decision = decisions.get(row.carrierCompanyId) ?? null;
  const lostToOther = row.latest.status_reason === 'other_offer_accepted';

  return (
    <>
      <RealtimeRefresh table="offers" column="negotiation_id" value={row.negotiationId} />
      <Link
        href={loadPath(load.id)}
        className={cn(buttonVariants({ variant: 'link' }), 'mb-4 gap-1 text-subhead')}
      >
        <ChevronLeft aria-hidden className="size-4" />
        {c.back}
      </Link>
      <PageHeader
        title={c.title(row.carrierName)}
        status={<VerificationBadge status={row.carrierStatus} />}
        description={`${load.origin_city} → ${load.destination_city} · ${c.proposedPrice(formatMoney(load.proposed_price_cents))}`}
      />

      <DetailLayout
        rail={
          <DetailRail>
            <RailSection label={n.latest}>
              <Pill tone={negotiationTone(row.state)}>{negotiationLabel(row)}</Pill>
              <Money cents={row.latest.amount_cents} size="numeral" className="block" />
              <p className="text-footnote text-text-dim">
                {c.proposedPrice(formatMoney(load.proposed_price_cents))}
              </p>
            </RailSection>
            {row.state === 'respond' && (
              <RailSection>
                <OfferResponse
                  offerId={row.latest.id}
                  amount={formatMoney(row.latest.amount_cents)}
                  carrier={row.carrierName}
                  stacked
                />
              </RailSection>
            )}
            {row.state === 'accepted' && (
              <RailSection>
                <Notice tone="success">{c.contracted}</Notice>
              </RailSection>
            )}
            {row.state === 'closed' && (
              <RailSection>
                <Notice tone="info">{lostToOther ? c.otherOfferAccepted : c.closed}</Notice>
              </RailSection>
            )}
            <RailSection label={n.unit}>
              <div className="text-subhead">
                <UnitSummary vehicle={row.vehicle} />
              </div>
            </RailSection>
          </DetailRail>
        }
      >
        <PageSection title={chatCopy.title} description={chatCopy.description}>
          {chat && row.conversationId && (
            <ChatPanel
              conversationId={row.conversationId}
              viewerId={viewer.userId}
              ownCompanyUserIds={chat.ownCompanyUserIds}
              initialMessages={chat.messages}
              initialReads={chat.reads}
            />
          )}
        </PageSection>

        <PageSection title={c.history}>
          <Group>
            <ol>
              {row.offers.map((offer) => (
                <li key={offer.id} className={cn(groupRow, 'space-y-1 px-4 py-3')}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-subhead text-text">
                      {c.side[offer.side]} · <Money cents={offer.amount_cents} />
                    </p>
                    <span className="flex items-center gap-2">
                      <Pill tone={offerStatusTone(offer.status)}>
                        {offerStatusLabels[offer.status]}
                      </Pill>
                      <span className="text-meta text-text-dim">
                        {formatDateTime(offer.created_at)}
                      </span>
                    </span>
                  </div>
                  {offer.conditions && (
                    <p className="text-footnote text-text-dim">
                      {c.conditions}: {offer.conditions}
                    </p>
                  )}
                  {offerStatusReasonText(offer.status_reason) && (
                    <p className="text-footnote text-text-dim">
                      {c.reason}: {offerStatusReasonText(offer.status_reason)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Group>
        </PageSection>

        <ProviderStatusForm
          carrierCompanyId={row.carrierCompanyId}
          status={decision?.status ?? null}
          decidedAt={decision?.decidedAt ?? null}
        />
      </DetailLayout>
    </>
  );
}
