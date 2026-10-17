import {
  chatCopy,
  formatDateTime,
  formatMxn,
  offersCopy,
  offerStatusLabels,
  offerStatusReasonText,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { ChatPanel } from '@/components/chat/chat-panel';
import { negotiationLabel, UnitSummary, VerificationBadge } from '@/components/offers/offer-board';
import { OfferResponse } from '@/components/offers/offer-response';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { getChat } from '@/lib/chat/queries';
import { getCompanyLoad, shipperContext } from '@/lib/loads/queries';
import { findNegotiation, getOfferBoard } from '@/lib/offers/queries';
import { loadPath, negotiationPath } from '@/lib/routing';
import { getViewer } from '@/lib/session';
import { cn } from '@/lib/utils';

const c = offersCopy.negotiation;

export const metadata: Metadata = { title: offersCopy.board.title };

/** One negotiation of a load: offer history, the shipper's response and the chat. */
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
  const chat = row.conversationId ? await getChat(supabase, row.conversationId, companyId) : null;
  const lostToOther = row.latest.status_reason === 'other_offer_accepted';

  return (
    <>
      <RealtimeRefresh table="offers" column="negotiation_id" value={row.negotiationId} />
      <Link href={loadPath(load.id)} className="text-sm text-accent hover:underline">
        {c.back}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={c.title(row.carrierName)}
          description={`${load.origin_city} → ${load.destination_city} · ${c.proposedPrice(formatMxn(load.proposed_price_cents))}`}
        />
        <VerificationBadge status={row.carrierStatus} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-2xl">{c.history}</h2>
            <ol className="divide-y rounded-xl border bg-card">
              {row.offers.map((offer) => (
                <li key={offer.id} className="space-y-1 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {c.side[offer.side]} · {formatMxn(offer.amount_cents)}
                    </p>
                    <span
                      className={cn(
                        'text-xs',
                        offer.status === 'accepted' ? 'text-success' : 'text-muted-foreground',
                      )}
                    >
                      {offerStatusLabels[offer.status]} · {formatDateTime(offer.created_at)}
                    </span>
                  </div>
                  {offer.conditions && (
                    <p className="text-sm text-muted-foreground">
                      {c.conditions}: {offer.conditions}
                    </p>
                  )}
                  {offerStatusReasonText(offer.status_reason) && (
                    <p className="text-sm text-muted-foreground">
                      {c.reason}: {offerStatusReasonText(offer.status_reason)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{chatCopy.title}</h2>
            <p className="text-sm text-muted-foreground">{chatCopy.description}</p>
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

        <aside className="space-y-3">
          <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <p className="text-xs text-muted-foreground">{offersCopy.board.columns.status}</p>
            <p className="font-medium">{negotiationLabel(row)}</p>
            <p className="text-xs text-muted-foreground">{offersCopy.board.columns.unit}</p>
            <UnitSummary vehicle={row.vehicle} />
          </div>
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
        </aside>
      </div>
    </>
  );
}
