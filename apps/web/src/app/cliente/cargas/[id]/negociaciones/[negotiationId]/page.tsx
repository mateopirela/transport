import {
  chatCopy,
  formatDateTime,
  formatMxn,
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
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { ProviderStatusForm } from '@/components/shared-documents/provider-status';
import { buttonVariants } from '@/components/ui/button';
import { ValueRow } from '@/components/ui/cell';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { getChat } from '@/lib/chat/queries';
import { getCompanyLoad, shipperContext } from '@/lib/loads/queries';
import { findNegotiation, getOfferBoard } from '@/lib/offers/queries';
import { loadPath, negotiationPath } from '@/lib/routing';
import { getViewer } from '@/lib/session';
import { getProviderDecisions } from '@/lib/shared-documents/queries';
import { negotiationTone } from '@/lib/status-tones';
import { cn } from '@/lib/utils';

const c = offersCopy.negotiation;

export const metadata: Metadata = { title: offersCopy.board.title };

/**
 * One negotiation of a load: the offers, the shipper's response and the
 * provider status on the left; the chat on the right (one column on a phone).
 */
export default async function NegotiationPage({
  params,
}: PageProps<'/cliente/cargas/[id]/negociaciones/[negotiationId]'>) {
  const { id, negotiationId } = await params;
  const { supabase, companyId } = await shipperContext(negotiationPath(id, negotiationId));
  const load = await getCompanyLoad(supabase, companyId, id);
  if (!load) notFound();
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
        description={`${load.origin_city} → ${load.destination_city} · ${c.proposedPrice(formatMxn(load.proposed_price_cents))}`}
      />

      <div className="grid gap-x-8 gap-y-10 lg:grid-cols-2">
        <div className="space-y-8">
          <Group>
            <ValueRow label={offersCopy.board.columns.status}>
              <Pill tone={negotiationTone(row.state)}>{negotiationLabel(row)}</Pill>
            </ValueRow>
            <div className={cn(groupRow, 'space-y-1 px-4 py-2.5')}>
              <p className="text-subhead text-text-dim">{offersCopy.board.columns.unit}</p>
              <div className="text-body">
                <UnitSummary vehicle={row.vehicle} />
              </div>
            </div>
          </Group>

          {row.state === 'respond' && (
            <OfferResponse
              offerId={row.latest.id}
              amount={formatMxn(row.latest.amount_cents)}
              carrier={row.carrierName}
            />
          )}
          {row.state === 'accepted' && <Notice tone="success">{c.contracted}</Notice>}
          {row.state === 'closed' && (
            <Notice tone="info">{lostToOther ? c.otherOfferAccepted : c.closed}</Notice>
          )}

          <section className="space-y-3">
            <h2 className="px-1 text-title2 text-text">{c.history}</h2>
            <Group>
              <ol>
                {row.offers.map((offer) => (
                  <li key={offer.id} className={cn(groupRow, 'space-y-1 px-4 py-3')}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-body text-text">
                        {c.side[offer.side]} ·{' '}
                        <span className="font-semibold tabular-nums">
                          {formatMxn(offer.amount_cents)}
                        </span>
                      </p>
                      <span
                        className={cn(
                          'text-footnote tabular-nums',
                          offer.status === 'accepted' ? 'text-ok-text' : 'text-text-dim',
                        )}
                      >
                        {offerStatusLabels[offer.status]} · {formatDateTime(offer.created_at)}
                      </span>
                    </div>
                    {offer.conditions && (
                      <p className="text-subhead text-text-dim">
                        {c.conditions}: {offer.conditions}
                      </p>
                    )}
                    {offerStatusReasonText(offer.status_reason) && (
                      <p className="text-subhead text-text-dim">
                        {c.reason}: {offerStatusReasonText(offer.status_reason)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Group>
          </section>

          <ProviderStatusForm
            carrierCompanyId={row.carrierCompanyId}
            status={decision?.status ?? null}
            decidedAt={decision?.decidedAt ?? null}
          />
        </div>

        <section className="space-y-3 lg:sticky lg:top-32 lg:self-start">
          <div className="space-y-1 px-1">
            <h2 className="text-title2 text-text">{chatCopy.title}</h2>
            <p className="text-subhead text-text-dim">{chatCopy.description}</p>
          </div>
          {chat && row.conversationId && (
            <ChatPanel
              conversationId={row.conversationId}
              viewerId={viewer.userId}
              ownCompanyUserIds={chat.ownCompanyUserIds}
              initialMessages={chat.messages}
              initialReads={chat.reads}
            />
          )}
        </section>
      </div>
    </>
  );
}
