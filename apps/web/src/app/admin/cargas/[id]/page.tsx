import {
  adminOpsCopy,
  formatDate,
  formatDateTime,
  formatMxn,
  offerSideLabels,
  offerStatusLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AcceptOfferForm, ContractForm } from '@/components/admin/ops-forms';
import { PageHeading } from '@/components/app-shell';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
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
      <Link href={paths.adminLoads} className="text-sm text-accent hover:underline">
        {c.back}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={formatRoute(load)}
          description={`${load.shipper?.legal_name ?? ''} · ${formatDate(load.pickup_window_start)}`}
        />
        <LoadStatusBadge status={load.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section className="space-y-2 text-sm">
            <p>{c.proposedPrice(formatMxn(load.proposed_price_cents))}</p>
            {load.agreed_price_cents !== null && (
              <p>
                {c.agreedPrice(formatMxn(load.agreed_price_cents))} · {load.carrier?.legal_name}
              </p>
            )}
            {trip && (
              <p className="flex items-center gap-2">
                {c.trip}: <TripStatusBadge status={trip.status} />
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{c.offers}</h2>
            {offers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.noOffers}</p>
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
                    <td className="font-medium">{offer.carrierName}</td>
                    <td>{offerSideLabels[offer.side]}</td>
                    <td className="whitespace-nowrap">{formatMxn(offer.amount_cents)}</td>
                    <td>{offer.byAdmin ? c.byAdmin : c.byParty}</td>
                    <td className="whitespace-nowrap">{formatDateTime(offer.created_at)}</td>
                    <td className="space-y-1">
                      <span>{offerStatusLabels[offer.status]}</span>
                      {open && offer.status === 'pending' && (
                        <AcceptOfferForm offerId={offer.id} side={offer.side} />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {open ? (
            <ContractForm loadId={load.id} carriers={carriers} />
          ) : (
            <p className="text-sm text-muted-foreground">{adminOpsCopy.contract.closed}</p>
          )}
        </aside>
      </div>
    </>
  );
}
