import {
  adminPanelCopy,
  brokeredAdminStage,
  brokeredCopy,
  brokeredMarginCents,
  formatDateTime,
  offerStatusLabels,
  uiCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { OfferResponseForm, QuoteForm } from '@/components/brokered/admin-brokered-forms';
import { BrokeredStagePill } from '@/components/brokered/brokered-stage-pill';
import { BackLink, PageSection, textLink } from '@/components/page-section';
import { ValueRow } from '@/components/ui/cell';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Empty } from '@/components/ui/empty';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { adminContext, getAdminLoad } from '@/lib/admin/queries';
import { getAdminBrokered } from '@/lib/brokered/queries';
import { offerStatusTone } from '@/lib/status-tones';
import { adminBrokeredPath, adminCompanyPath, adminLoadPath, paths } from '@/lib/routing';

const c = brokeredCopy.admin;
const p = adminPanelCopy.brokered;

export const metadata: Metadata = { title: c.title };

function Price({ cents }: { cents: number | null }) {
  return cents === null ? <>{adminPanelCopy.lists.noPrice}</> : <Money cents={cents} />;
}

/**
 * Admin: one brokered load (I6, D39), in two columns (docs/plan-fulmis.md
 * §1.5). On the left its prices (the client's, and the carriers' rate, which
 * only the carriers see) and the carriers' offers, which the admin answers in
 * the name of Transport; on the right the rail with the stage, the margin
 * once a carrier is contracted, and the facts.
 */
export default async function AdminBrokeredLoadPage({
  params,
}: PageProps<'/admin/intermediadas/[id]'>) {
  const { id } = await params;
  const supabase = await adminContext(adminBrokeredPath(id));
  const [row, detail] = await Promise.all([
    getAdminBrokered(supabase, id),
    getAdminLoad(supabase, id),
  ]);
  if (!row || !detail) notFound();
  const stage = brokeredAdminStage(row.quote_status, row.load_status);
  const quotable = stage === 'toQuote' || stage === 'waitingClient' || stage === 'published';
  const margin =
    row.client_price_cents !== null && row.agreed_price_cents !== null
      ? brokeredMarginCents(row.client_price_cents, row.agreed_price_cents)
      : null;

  const rail = (
    <DetailRail>
      <RailSection label={p.stage}>
        <BrokeredStagePill stage={stage} />
      </RailSection>
      {margin !== null ? (
        <RailSection label={c.margin}>
          <Money cents={margin} size="numeral" className="block" data-testid="brokered-margin" />
        </RailSection>
      ) : (
        <RailSection label={p.clientPrice}>
          <span className="block text-numeral text-text tabular-nums">
            <Price cents={row.client_price_cents} />
          </span>
        </RailSection>
      )}
      <div>
        <ValueRow label={c.shipper}>
          <Link href={adminCompanyPath(row.shipper_company_id)} className={textLink}>
            {row.shipper_name}
          </Link>
        </ValueRow>
        <ValueRow label={c.target}>
          {row.target_price_cents === null ? (
            brokeredCopy.shipper.toQuote
          ) : (
            <Money cents={row.target_price_cents} />
          )}
        </ValueRow>
        <ValueRow label={p.clientPrice}>
          <Price cents={row.client_price_cents} />
        </ValueRow>
        <ValueRow label={p.carrierPrice}>
          <Price cents={row.carrier_price_cents} />
        </ValueRow>
        {row.agreed_price_cents !== null && (
          <ValueRow label={c.agreedPrice}>
            <Money cents={row.agreed_price_cents} />
          </ValueRow>
        )}
      </div>
      <RailSection>
        <Link href={adminLoadPath(row.load_id)} className={textLink}>
          {c.loadDetail}
        </Link>
      </RailSection>
    </DetailRail>
  );

  return (
    <>
      <BackLink href={paths.adminBrokered}>{c.back}</BackLink>
      <PageHeader
        eyebrow={adminPanelCopy.brokeredDetail.eyebrow}
        title={`${row.origin_city} → ${row.destination_city}`}
        status={<BrokeredStagePill stage={stage} />}
        description={`${row.shipper_name} · ${c.pickup} ${formatDateTime(row.pickup_window_start)}`}
      />

      <DetailLayout rail={rail}>
        {quotable && (
          <PageSection title={c.quoteTitle}>
            <div className="border bg-cell p-5" data-testid="brokered-quote">
              <QuoteForm
                loadId={row.load_id}
                clientPriceCents={row.client_price_cents}
                carrierPriceCents={row.carrier_price_cents}
                clientApproved={row.quote_status === 'approved'}
              />
            </div>
          </PageSection>
        )}

        <PageSection title={c.offersTitle}>
          {detail.offers.length === 0 ? (
            <Empty title={c.noOffers} />
          ) : (
            <Table
              cards
              headers={[
                c.columns.carrier,
                c.columns.from,
                { label: c.columns.amount, align: 'right' },
                c.columns.created,
                c.columns.status,
                { label: uiCopy.actions, srOnly: true },
              ]}
            >
              {detail.offers.map((offer) => (
                <TableRow key={offer.id} data-testid={`brokered-offer-${offer.id}`}>
                  <TableCell primary>{offer.carrierName}</TableCell>
                  <TableCell label={c.columns.from}>{c.offerFrom[offer.side]}</TableCell>
                  <TableCell label={c.columns.amount} numeric>
                    <Money cents={offer.amount_cents} />
                    {/* The carrier's terms, read before answering (waiting time, extras). */}
                    {offer.conditions && (
                      <span className="mt-1 block max-w-56 text-footnote font-normal text-text-dim">
                        {c.conditions}: {offer.conditions}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    label={c.columns.created}
                    className="whitespace-nowrap text-text-dim tabular-nums"
                  >
                    {formatDateTime(offer.created_at)}
                  </TableCell>
                  <TableCell label={c.columns.status}>
                    <Pill tone={offerStatusTone(offer.status)}>
                      {offerStatusLabels[offer.status]}
                    </Pill>
                  </TableCell>
                  <TableCell action>
                    {stage === 'published' &&
                      offer.status === 'pending' &&
                      offer.side === 'carrier' && (
                        <OfferResponseForm loadId={row.load_id} offerId={offer.id} />
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </PageSection>
      </DetailLayout>
    </>
  );
}
