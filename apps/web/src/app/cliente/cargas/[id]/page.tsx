import {
  brokeredClientStage,
  brokeredCopy,
  cargoTypeLabels,
  clientListsCopy,
  clientTripsCopy,
  formatDateTime,
  formatMoney,
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
import { ApproveQuoteButton } from '@/components/loads/brokered-quote';
import { CancelLoadForm, PublishLoadButton } from '@/components/loads/load-actions';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { RouteMap } from '@/components/loads/route-map';
import { OfferBoard } from '@/components/offers/offer-board';
import { PageSection } from '@/components/page-section';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import { ShareDialog } from '@/components/share/share-dialog';
import { SiteDwellGroup } from '@/components/trips/site-dwell';
import { buttonVariants } from '@/components/ui/button';
import { ValueRow } from '@/components/ui/cell';
import { DetailLayout, DetailRail, RailActions, RailSection } from '@/components/ui/detail-layout';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { ownSiteDwells } from '@/lib/dwell';
import { getCompanyLoad, serverRoadFactor, shipperContext } from '@/lib/loads/queries';
import { shipperLoadActions } from '@/lib/loads/status';
import { getOfferBoard } from '@/lib/offers/queries';
import { editLoadPath, loadPath, paths, tripPath } from '@/lib/routing';
import { listActiveShareLinks } from '@/lib/share-links/queries';
import { getProviderDecisions } from '@/lib/shared-documents/queries';
import { findLoadTrip } from '@/lib/trips/queries';
import { cn } from '@/lib/utils';

const c = loadsCopy.detail;
const b = brokeredCopy.shipper;
const number = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

export const metadata: Metadata = { title: loadsCopy.list.title };

/**
 * One load of the shipper (V3, §1.5): the offers first, as cards with their
 * buttons, then the details, the route and the times at the shipper's sites;
 * on the right a rail with the price, the windows and the cancellation. The
 * one primary (follow the trip, publish the draft, approve the quoted price,
 * or accept the best offer) is always in the first screen.
 */
export default async function LoadDetailPage({
  params,
  searchParams,
}: PageProps<'/cliente/cargas/[id]'>) {
  const { id } = await params;
  const { supabase, companyId } = await shipperContext(loadPath(id));
  const load = await getCompanyLoad(supabase, companyId, id);
  if (!load) notFound();
  const { aviso } = await searchParams;
  // A load sent to the platform (I6) is negotiated by Transport: the client
  // never sees the carriers' offers (nor can read them).
  const direct =
    !load.brokered && load.proposed_price_cents !== null
      ? { ...load, proposed_price_cents: load.proposed_price_cents }
      : null;
  const offers = direct && direct.status !== 'draft' ? await getOfferBoard(supabase, direct) : [];
  const stage = brokeredClientStage(load.brokered_status, load.status);
  const decisions = await getProviderDecisions(supabase, {
    shipperCompanyId: companyId,
    carrierCompanyIds: offers.map((row) => row.carrierCompanyId),
  });
  const providerStates = Object.fromEntries(
    [...decisions].map(([carrierId, decision]) => [carrierId, decision.status]),
  );
  const actions = shipperLoadActions(load.status, load.brokered);
  // accept_offer creates the trip together with the acceptance (B06).
  const trip = load.accepted_offer_id ? await findLoadTrip(supabase, companyId, load.id) : null;
  const tripId = trip?.id ?? null;
  // A published load can be shared with anyone, read-only (G7, D23). Its
  // active links stay listed (and revocable) after it leaves the market.
  const shareable = load.status === 'published' || load.status === 'negotiating';
  const [shareLinks, siteDwells] = await Promise.all([
    listActiveShareLinks(supabase, { loadId: load.id }),
    // H5: how long trucks usually take at the shipper's own pickup and delivery.
    ownSiteDwells(supabase, load),
  ]);
  const range = (start: string, end: string) =>
    c.window(formatDateTime(start), formatDateTime(end));

  const optional = (value: string | null, format: (v: string) => string) =>
    value === null ? null : format(value);
  // Label and value; rows without a value are left out. The price and the
  // windows live in the rail.
  const rows: [string, string | null][] = [
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
    ...(load.brokered
      ? ([
          [
            b.targetLabel,
            load.target_price_cents === null ? null : formatMoney(load.target_price_cents),
          ],
        ] satisfies [string, string | null][])
      : []),
    [c.notes, load.notes],
    [c.created, formatDateTime(load.created_at)],
    [c.published, optional(load.published_at, formatDateTime)],
    [c.cancelled, optional(load.cancelled_at, formatDateTime)],
    // A cancelled trip has the structured reason (G5); a load cancelled before, its own text.
    [c.cancellationReason, trip?.cancellation ?? load.cancellation_reason],
  ];
  const details = rows.filter((row): row is [string, string] => row[1] !== null);

  // The amount of the rail: the agreed price once contracted, else the client's price.
  const price =
    load.agreed_price_cents !== null
      ? { label: c.agreedPrice, cents: load.agreed_price_cents }
      : { label: load.brokered ? b.priceLabel : c.price, cents: load.proposed_price_cents };

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
        status={<LoadStatusBadge status={load.status} quoteStatus={load.brokered_status} />}
        description={`${load.origin_address} → ${load.destination_address}`}
        action={
          // The one primary: follow the trip once contracted, publish a draft,
          // approve the quoted price. While offers wait, it is on the best one.
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
            {stage === 'quoted' && load.proposed_price_cents !== null && (
              <ApproveQuoteButton loadId={load.id} priceCents={load.proposed_price_cents} />
            )}
          </>
        }
      />

      <DetailLayout
        rail={
          <DetailRail>
            <RailSection label={price.label}>
              {price.cents === null ? (
                <p className="text-title3 text-text-dim">{b.toQuote}</p>
              ) : (
                <Money cents={price.cents} size="numeral" className="block" />
              )}
            </RailSection>
            <RailSection label={c.pickup}>
              <p className="text-subhead text-text">
                {range(load.pickup_window_start, load.pickup_window_end)}
              </p>
            </RailSection>
            <RailSection label={c.delivery}>
              <p className="text-subhead text-text">
                {range(load.delivery_window_start, load.delivery_window_end)}
              </p>
            </RailSection>
            {actions.cancel && (
              <RailSection>
                <RailActions>
                  <CancelLoadForm loadId={load.id} />
                </RailActions>
              </RailSection>
            )}
          </DetailRail>
        }
      >
        {load.status === 'draft' && !load.brokered && (
          <div className="space-y-3">
            {aviso === 'no-publicada' && <Notice tone="error">{c.publishFailed}</Notice>}
            <Notice tone="info">{c.draftNotice}</Notice>
          </div>
        )}

        {load.brokered ? (
          <PageSection title={b.title}>
            <div data-testid="brokered-load">
              {stage ? (
                <Notice tone="info">
                  {b.stageHelp[stage]}
                  {stage === 'quoted' && ` ${b.cancelHint}`}
                </Notice>
              ) : null}
            </div>
          </PageSection>
        ) : (
          <PageSection title={o.title} description={`${o.description} ${o.live}`}>
            {offers.length > 0 ? (
              <OfferBoard loadId={load.id} rows={offers} providerStates={providerStates} />
            ) : (
              <Empty title={load.status === 'draft' ? o.emptyDraft : o.empty} />
            )}
          </PageSection>
        )}

        <PageSection title={clientListsCopy.load.details}>
          <Group>
            {details.map(([label, value]) => (
              <ValueRow key={label} label={label}>
                {value}
              </ValueRow>
            ))}
          </Group>
        </PageSection>

        <PageSection title={c.route}>
          <RouteMap
            origin={{ lat: load.origin_lat, lng: load.origin_lng, label: load.origin_city }}
            destination={{
              lat: load.destination_lat,
              lng: load.destination_lng,
              label: load.destination_city,
            }}
            roadFactor={serverRoadFactor()}
          />
        </PageSection>

        <SiteDwellGroup pickup={siteDwells.pickup} delivery={siteDwells.delivery} />
      </DetailLayout>
    </>
  );
}
