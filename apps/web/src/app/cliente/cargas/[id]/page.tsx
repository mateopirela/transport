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
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { CancelLoadForm, PublishLoadButton } from '@/components/loads/load-actions';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { RouteMap } from '@/components/loads/route-map';
import { OfferBoard } from '@/components/offers/offer-board';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { buttonVariants } from '@/components/ui/button';
import { getCompanyLoad, serverRoadFactor, shipperContext } from '@/lib/loads/queries';
import { shipperLoadActions } from '@/lib/loads/status';
import { getOfferBoard } from '@/lib/offers/queries';
import { editLoadPath, loadPath, paths, tripPath } from '@/lib/routing';
import { findLoadTripId } from '@/lib/trips/queries';

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
  const actions = shipperLoadActions(load.status);
  // accept_offer creates the trip together with the acceptance (B06).
  const tripId = load.accepted_offer_id ? await findLoadTripId(supabase, companyId, load.id) : null;
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
    [c.cancellationReason, load.cancellation_reason],
  ];
  const details = rows.filter((row): row is [string, string] => row[1] !== null);

  const o = offersCopy.board;
  return (
    <>
      <RealtimeRefresh table="offers" column="load_id" value={load.id} />
      <Link href={paths.shipperLoads} className="text-sm text-accent hover:underline">
        {c.back}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={`${load.origin_city} → ${load.destination_city}`}
          description={`${load.origin_address} → ${load.destination_address}`}
        />
        <LoadStatusBadge status={load.status} />
      </div>

      <div className="space-y-4">
        {aviso === 'no-publicada' && load.status === 'draft' && (
          <Notice tone="error">{c.publishFailed}</Notice>
        )}
        {load.status === 'draft' && <Notice tone="info">{c.draftNotice}</Notice>}

        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="space-y-3">
            <h2 className="text-2xl">{c.route}</h2>
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
          <aside className="space-y-3">
            {tripId && (
              <Link href={tripPath(tripId)} className={buttonVariants({ variant: 'accent' })}>
                {clientTripsCopy.loadLink}
              </Link>
            )}
            {actions.publish && <PublishLoadButton loadId={load.id} />}
            {actions.edit && (
              <Link href={editLoadPath(load.id)} className={buttonVariants({ variant: 'outline' })}>
                {c.edit}
              </Link>
            )}
            {actions.cancel && <CancelLoadForm loadId={load.id} />}
          </aside>
        </div>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-2xl">{o.title}</h2>
            <p className="text-sm text-muted-foreground">
              {o.description} {o.live}
            </p>
          </div>
          {offers.length > 0 ? (
            <OfferBoard loadId={load.id} rows={offers} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {load.status === 'draft' ? o.emptyDraft : o.empty}
            </p>
          )}
        </section>

        <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-6 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="space-y-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
