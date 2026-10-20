import {
  cargoTypeLabels,
  clientTripsCopy,
  formatDateTime,
  formatMxn,
  loadsCopy,
  offersCopy,
  specialRequirementLabels,
  unitTypeLabels,
} from '@transport/shared';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Notice } from '@/components/auth-forms';
import { CancelLoadForm, PublishLoadButton } from '@/components/loads/load-actions';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { RouteMap } from '@/components/loads/route-map';
import { OfferBoard } from '@/components/offers/offer-board';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { ShareDialog } from '@/components/share/share-dialog';
import { buttonVariants } from '@/components/ui/button';
import { ValueRow } from '@/components/ui/cell';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { getCompanyLoad, serverRoadFactor, shipperContext } from '@/lib/loads/queries';
import { shipperLoadActions } from '@/lib/loads/status';
import { getOfferBoard } from '@/lib/offers/queries';
import { editLoadPath, loadPath, paths, tripPath } from '@/lib/routing';
import { listActiveShareLinks } from '@/lib/share-links/queries';
import { getProviderDecisions } from '@/lib/shared-documents/queries';
import { findLoadTrip } from '@/lib/trips/queries';
import { cn } from '@/lib/utils';

const c = loadsCopy.detail;
const number = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

export const metadata: Metadata = { title: loadsCopy.list.title };

export default async function LoadDetailPage({
  params,
  searchParams,
}: PageProps<'/cliente/cargas/[id]'>) {
  const { id } = await params;
  const { supabase, companyId } = await shipperContext(loadPath(id));
  const load = await getCompanyLoad(supabase, companyId, id);
  if (!load) notFound();
  const { aviso } = await searchParams;
  const offers = load.status === 'draft' ? [] : await getOfferBoard(supabase, load);
  const decisions = await getProviderDecisions(supabase, {
    shipperCompanyId: companyId,
    carrierCompanyIds: offers.map((row) => row.carrierCompanyId),
  });
  const providerStates = Object.fromEntries(
    [...decisions].map(([carrierId, decision]) => [carrierId, decision.status]),
  );
  const actions = shipperLoadActions(load.status);
  // accept_offer creates the trip together with the acceptance (B06).
  const trip = load.accepted_offer_id ? await findLoadTrip(supabase, companyId, load.id) : null;
  const tripId = trip?.id ?? null;
  // A published load can be shared with anyone, read-only (G7, D23). Its
  // active links stay listed (and revocable) after it leaves the market.
  const shareable = load.status === 'published' || load.status === 'negotiating';
  const shareLinks = await listActiveShareLinks(supabase, { loadId: load.id });
  const range = (start: string, end: string) =>
    c.window(formatDateTime(start), formatDateTime(end));

  const optional = (value: string | null, format: (v: string) => string) =>
    value === null ? null : format(value);
  // Label and value; rows without a value are left out.
  const rows: [string, string | null][] = [
    [c.pickup, range(load.pickup_window_start, load.pickup_window_end)],
    [c.delivery, range(load.delivery_window_start, load.delivery_window_end)],
    [c.cargoType, cargoTypeLabels[load.cargo_type]],
    [c.cargo, load.description],
    [c.weight, c.weightValue(number.format(load.weight_kg))],
    [c.volume, load.volume_m3 === null ? null : c.volumeValue(number.format(load.volume_m3))],
    [c.unitType, unitTypeLabels[load.unit_type]],
    [
      c.requirements,
      load.special_requirements.length === 0
        ? c.noRequirements
        : load.special_requirements.map((r) => specialRequirementLabels[r]).join(', '),
    ],
    [c.price, formatMxn(load.proposed_price_cents)],
    [c.agreedPrice, load.agreed_price_cents === null ? null : formatMxn(load.agreed_price_cents)],
    [c.notes, load.notes],
    [c.created, formatDateTime(load.created_at)],
    [c.published, optional(load.published_at, formatDateTime)],
    [c.cancelled, optional(load.cancelled_at, formatDateTime)],
    // A cancelled trip has the structured reason (G5); a load cancelled before, its own text.
    [c.cancellationReason, trip?.cancellation ?? load.cancellation_reason],
  ];
  const details = rows.filter((row): row is [string, string] => row[1] !== null);

  const o = offersCopy.board;
  return (
    <>
      <RealtimeRefresh table="offers" column="load_id" value={load.id} />
      <Link
        href={paths.shipperLoads}
        className={cn(buttonVariants({ variant: 'link' }), 'mb-4 gap-1 text-subhead')}
      >
        <ChevronLeft aria-hidden className="size-4" />
        {c.back}
      </Link>
      <PageHeader
        title={`${load.origin_city} → ${load.destination_city}`}
        status={<LoadStatusBadge status={load.status} />}
        description={`${load.origin_address} → ${load.destination_address}`}
        action={
          // The one primary: follow the trip once contracted, publish a draft.
          <>
            {(shareable || shareLinks.length > 0) && (
              <ShareDialog
                kind="load_public"
                targetId={load.id}
                links={shareLinks}
                canCreate={shareable}
              />
            )}
            {actions.edit && (
              <Link
                href={editLoadPath(load.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {c.edit}
              </Link>
            )}
            {tripId && (
              <Link href={tripPath(tripId)} className={buttonVariants()}>
                {clientTripsCopy.loadLink}
              </Link>
            )}
            {actions.publish && <PublishLoadButton loadId={load.id} />}
          </>
        }
      />

      {load.status === 'draft' && (
        <div className="mb-8 space-y-3">
          {aviso === 'no-publicada' && <Notice tone="error">{c.publishFailed}</Notice>}
          <Notice tone="info">{c.draftNotice}</Notice>
        </div>
      )}

      <div className="grid gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          <section className="space-y-3">
            <h2 className="px-1 text-title2 text-text">{c.route}</h2>
            <RouteMap
              origin={{ lat: load.origin_lat, lng: load.origin_lng, label: load.origin_city }}
              destination={{
                lat: load.destination_lat,
                lng: load.destination_lng,
                label: load.destination_city,
              }}
              roadFactor={serverRoadFactor()}
            />
          </section>

          <section className="space-y-3">
            <div className="space-y-1 px-1">
              <h2 className="text-title2 text-text">{o.title}</h2>
              <p className="text-subhead text-text-dim">
                {o.description} {o.live}
              </p>
            </div>
            {offers.length > 0 ? (
              <OfferBoard loadId={load.id} rows={offers} providerStates={providerStates} />
            ) : (
              <p className="rounded-2xl border bg-cell px-4 py-3.5 text-subhead text-text-dim">
                {load.status === 'draft' ? o.emptyDraft : o.empty}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Group>
            {details.map(([label, value]) => (
              <ValueRow key={label} label={label}>
                {value}
              </ValueRow>
            ))}
          </Group>
          {actions.cancel && <CancelLoadForm loadId={load.id} />}
        </aside>
      </div>
    </>
  );
}
