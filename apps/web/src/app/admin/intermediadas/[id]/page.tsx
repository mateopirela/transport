import {
  brokeredAdminStage,
  brokeredCopy,
  brokeredMarginCents,
  formatDateTime,
  formatMxn,
  offerStatusLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { OfferResponseForm, QuoteForm } from '@/components/brokered/admin-brokered-forms';
import { BrokeredStagePill } from '@/components/brokered/brokered-stage-pill';
import { BackLink, PageSection, textLink } from '@/components/page-section';
import { ValueRow } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { adminContext, getAdminLoad } from '@/lib/admin/queries';
import { getAdminBrokered } from '@/lib/brokered/queries';
import { adminBrokeredPath, adminCompanyPath, adminLoadPath, paths } from '@/lib/routing';

const c = brokeredCopy.admin;

export const metadata: Metadata = { title: c.title };

const price = (cents: number | null) => (cents === null ? '—' : formatMxn(cents));

/**
 * Admin: one brokered load (I6, D39). Its prices (the client's, and the
 * carriers' rate, which only the carriers see), and the carriers' offers,
 * which the admin answers in the name of Transport. The margin shows once a
 * carrier is contracted.
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

  return (
    <>
      <BackLink href={paths.adminBrokered}>{c.back}</BackLink>
      <PageHeader
        title={`${row.origin_city} → ${row.destination_city}`}
        status={<BrokeredStagePill stage={stage} />}
        description={`${row.shipper_name} · ${c.pickup} ${formatDateTime(row.pickup_window_start)}`}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-10">
          {quotable && (
            <PageSection title={c.quoteTitle}>
              <div className="rounded-2xl border bg-cell p-5" data-testid="brokered-quote">
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
                headers={[
                  c.columns.carrier,
                  c.columns.from,
                  c.columns.amount,
                  c.columns.created,
                  c.columns.status,
                ]}
              >
                {detail.offers.map((offer) => (
                  <tr key={offer.id} data-testid={`brokered-offer-${offer.id}`}>
                    <td className="font-semibold">{offer.carrierName}</td>
                    <td>{c.offerFrom[offer.side]}</td>
                    <td className="whitespace-nowrap tabular-nums">
                      {formatMxn(offer.amount_cents)}
                    </td>
                    <td className="whitespace-nowrap text-text-dim tabular-nums">
                      {formatDateTime(offer.created_at)}
                    </td>
                    <td className="space-y-2">
                      <span>{offerStatusLabels[offer.status]}</span>
                      {stage === 'published' &&
                        offer.status === 'pending' &&
                        offer.side === 'carrier' && (
                          <OfferResponseForm loadId={row.load_id} offerId={offer.id} />
                        )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </PageSection>
        </div>

        <aside className="space-y-4">
          <Group>
            <ValueRow label={c.shipper}>
              <Link href={adminCompanyPath(row.shipper_company_id)} className={textLink}>
                {row.shipper_name}
              </Link>
            </ValueRow>
            <ValueRow label={c.target}>
              {row.target_price_cents === null
                ? brokeredCopy.shipper.toQuote
                : formatMxn(row.target_price_cents)}
            </ValueRow>
            <ValueRow label={c.clientPrice}>{price(row.client_price_cents)}</ValueRow>
            <ValueRow label={c.carrierPrice}>{price(row.carrier_price_cents)}</ValueRow>
            {row.agreed_price_cents !== null && (
              <ValueRow label={c.agreedPrice}>{formatMxn(row.agreed_price_cents)}</ValueRow>
            )}
            {margin !== null && (
              <ValueRow label={c.margin}>
                <span data-testid="brokered-margin">{formatMxn(margin)}</span>
              </ValueRow>
            )}
          </Group>
          <Link href={adminLoadPath(row.load_id)} className={textLink}>
            {c.loadDetail}
          </Link>
        </aside>
      </div>
    </>
  );
}
