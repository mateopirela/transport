import {
  adminOpsCopy,
  formatDate,
  formatDateTime,
  formatMxn,
  offerSideLabels,
  offerStatusLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AcceptOfferForm, ContractForm } from '@/components/admin/ops-forms';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { BackLink, PageSection } from '@/components/page-section';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { Cell, ValueRow } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { formatRoute } from '@/lib/admin/filters';
import { adminContext, getAdminLoad, listApprovedCarriers } from '@/lib/admin/queries';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.load;
const col = adminOpsCopy.columns;

export const metadata: Metadata = { title: adminOpsCopy.loads.title };

const OPEN = new Set(['published', 'negotiating']);

/** A load with its offers and trip; manual contracting while it is open (B16). */
export default async function AdminLoadPage({ params }: PageProps<'/admin/cargas/[id]'>) {
  const { id } = await params;
  const supabase = await adminContext(adminLoadPath(id));
  const detail = await getAdminLoad(supabase, id);
  if (!detail) notFound();
  const { load, offers, trip } = detail;
  const open = OPEN.has(load.status);
  const carriers = open ? await listApprovedCarriers(supabase) : [];

  return (
    <>
      <BackLink href={paths.adminLoads}>{c.back}</BackLink>
      <PageHeader
        title={formatRoute(load)}
        status={<LoadStatusBadge status={load.status} />}
        description={`${load.shipper?.legal_name ?? ''} · ${formatDate(load.pickup_window_start)}`}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-10">
          <Group>
            <Cell title={c.proposedPrice(formatMxn(load.proposed_price_cents))} />
            {load.agreed_price_cents !== null && (
              <Cell
                title={c.agreedPrice(formatMxn(load.agreed_price_cents))}
                value={load.carrier?.legal_name}
              />
            )}
            {trip && (
              <ValueRow label={c.trip}>
                <TripStatusBadge status={trip.status} />
              </ValueRow>
            )}
          </Group>

          <PageSection title={c.offers}>
            {offers.length === 0 ? (
              <Empty title={c.noOffers} />
            ) : (
              <Table
                headers={[
                  col.carrier,
                  col.side,
                  col.amount,
                  col.createdBy,
                  col.created,
                  col.status,
                ]}
              >
                {offers.map((offer) => (
                  <tr key={offer.id}>
                    <td className="font-semibold">{offer.carrierName}</td>
                    <td>{offerSideLabels[offer.side]}</td>
                    <td className="whitespace-nowrap tabular-nums">
                      {formatMxn(offer.amount_cents)}
                    </td>
                    <td className="text-text-dim">{offer.byAdmin ? c.byAdmin : c.byParty}</td>
                    <td className="whitespace-nowrap text-text-dim tabular-nums">
                      {formatDateTime(offer.created_at)}
                    </td>
                    <td className="space-y-2">
                      <span>{offerStatusLabels[offer.status]}</span>
                      {open && offer.status === 'pending' && (
                        <AcceptOfferForm offerId={offer.id} side={offer.side} />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </PageSection>
        </div>

        <aside className="space-y-4">
          {open ? (
            <ContractForm loadId={load.id} carriers={carriers} />
          ) : (
            <Notice tone="info">{adminOpsCopy.contract.closed}</Notice>
          )}
        </aside>
      </div>
    </>
  );
}
