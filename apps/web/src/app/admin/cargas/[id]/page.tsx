import {
  adminOpsCopy,
  adminPanelCopy,
  formatDate,
  formatDateTime,
  offerSideLabels,
  offerStatusLabels,
  uiCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AcceptOfferForm, ContractForm } from '@/components/admin/ops-forms';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { BackLink, PageSection } from '@/components/page-section';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { ValueRow } from '@/components/ui/cell';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Empty } from '@/components/ui/empty';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { formatRoute } from '@/lib/admin/filters';
import { adminContext, getAdminLoad, listApprovedCarriers } from '@/lib/admin/queries';
import { offerStatusTone } from '@/lib/status-tones';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.load;
const col = adminOpsCopy.columns;
const d = adminPanelCopy.loadDetail;

export const metadata: Metadata = { title: adminOpsCopy.loads.title };

const OPEN = new Set(['published', 'negotiating']);

/**
 * A load (B16) in two columns (docs/plan-fulmis.md §1.5): its offers on the
 * left, each pending one accepted from a confirmation; on the right the rail
 * with the state, the price and the manual contract while the load is open.
 */
export default async function AdminLoadPage({ params }: PageProps<'/admin/cargas/[id]'>) {
  const { id } = await params;
  const supabase = await adminContext(adminLoadPath(id));
  const detail = await getAdminLoad(supabase, id);
  if (!detail) notFound();
  const { load, offers, trip } = detail;
  const open = OPEN.has(load.status);
  const carriers = open ? await listApprovedCarriers(supabase) : [];
  const agreed = load.agreed_price_cents;

  const rail = (
    <DetailRail>
      <RailSection label={agreed === null ? d.proposed : d.agreed}>
        <Money cents={agreed ?? load.proposed_price_cents} size="numeral" className="block" />
        {agreed !== null && (
          <p className="text-footnote text-text-dim">
            {d.proposed}: <Money cents={load.proposed_price_cents} />
          </p>
        )}
        {/* The load's state is in the header; the rail adds its trip's. */}
        {trip && <TripStatusBadge status={trip.status} />}
      </RailSection>
      <RailSection label={adminOpsCopy.contract.title}>
        {open ? (
          <ContractForm loadId={load.id} carriers={carriers} />
        ) : (
          <Notice tone="info">{adminOpsCopy.contract.closed}</Notice>
        )}
      </RailSection>
      <div>
        <ValueRow label={d.shipper}>{load.shipper?.legal_name ?? ''}</ValueRow>
        <ValueRow label={d.carrier}>{load.carrier?.legal_name ?? d.noCarrier}</ValueRow>
        <ValueRow label={d.pickup}>{formatDate(load.pickup_window_start)}</ValueRow>
      </div>
    </DetailRail>
  );

  return (
    <>
      <BackLink href={paths.adminLoads}>{c.back}</BackLink>
      <PageHeader
        eyebrow={d.eyebrow}
        title={formatRoute(load)}
        status={<LoadStatusBadge status={load.status} />}
        description={`${load.shipper?.legal_name ?? ''} · ${formatDate(load.pickup_window_start)}`}
      />

      <DetailLayout rail={rail}>
        <PageSection title={c.offers}>
          {offers.length === 0 ? (
            <Empty title={c.noOffers} />
          ) : (
            <Table
              cards
              headers={[
                col.carrier,
                col.side,
                { label: col.amount, align: 'right' },
                col.createdBy,
                col.created,
                col.status,
                { label: uiCopy.actions, srOnly: true },
              ]}
            >
              {offers.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell primary>{offer.carrierName}</TableCell>
                  <TableCell label={col.side}>{offerSideLabels[offer.side]}</TableCell>
                  <TableCell label={col.amount} numeric>
                    <Money cents={offer.amount_cents} />
                  </TableCell>
                  <TableCell label={col.createdBy} className="text-text-dim">
                    {offer.byAdmin ? c.byAdmin : c.byParty}
                  </TableCell>
                  <TableCell
                    label={col.created}
                    className="whitespace-nowrap text-text-dim tabular-nums"
                  >
                    {formatDateTime(offer.created_at)}
                  </TableCell>
                  <TableCell label={col.status}>
                    <Pill tone={offerStatusTone(offer.status)}>
                      {offerStatusLabels[offer.status]}
                    </Pill>
                  </TableCell>
                  <TableCell action>
                    {open && offer.status === 'pending' && (
                      <AcceptOfferForm offerId={offer.id} side={offer.side} />
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
