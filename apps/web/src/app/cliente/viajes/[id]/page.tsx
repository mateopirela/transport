import {
  cancelLeavesUnitPending,
  canCancelTrip,
  cancellationText,
  canShareTripTracking,
  clientListsCopy,
  clientTripsCopy,
  evidenceStageLabels,
  formatDateTime,
  incidentKindLabels,
  incidentStatusLabels,
  loadsCopy,
  tripDocumentKindLabels,
  tripEventTypeLabels,
  tripProgressCopy,
  unitTypeLabels,
} from '@transport/shared';
import { ChevronLeft, CircleAlert, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Notice } from '@/components/auth-forms';
import { ChatPanel } from '@/components/chat/chat-panel';
import { VerificationBadge } from '@/components/offers/offer-board';
import { PageSection } from '@/components/page-section';
import { ShareDialog } from '@/components/share/share-dialog';
import { ProviderStatusForm } from '@/components/shared-documents/provider-status';
import { SharedDocumentsList } from '@/components/shared-documents/shared-documents-list';
import { AutoRefresh } from '@/components/trips/auto-refresh';
import { CargoInsuranceCard } from '@/components/trips/cargo-insurance-card';
import { SiteDwellGroup, TripEndRow } from '@/components/trips/site-dwell';
import { ConfirmDeliveryForm, ReportIncidentForm } from '@/components/trips/trip-actions';
import { TripCancelForm } from '@/components/trips/trip-cancel-form';
import { TripChecklist } from '@/components/trips/trip-checklist';
import { TripDocumentUpload } from '@/components/trips/trip-document-upload';
import { TripMap } from '@/components/trips/trip-map';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { ValueRow } from '@/components/ui/cell';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Group } from '@/components/ui/group';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Steps } from '@/components/ui/steps';
import { groupRow } from '@/components/ui/variants';
import { getChat } from '@/lib/chat/queries';
import { tripProgress } from '@/lib/client/trip-progress';
import { ownSiteDwells, tripEndEstimate } from '@/lib/dwell';
import { shipperContext } from '@/lib/loads/queries';
import { loadPath, paths, tripFileHref, tripPath } from '@/lib/routing';
import { getViewer } from '@/lib/session';
import { listActiveShareLinks } from '@/lib/share-links/queries';
import { getProviderDecisions, getSharedDocuments } from '@/lib/shared-documents/queries';
import { incidentStatusTone } from '@/lib/status-tones';
import { cancelShipperTrip } from '@/lib/trips/actions';
import { getCompanyTrip } from '@/lib/trips/queries';
import { mapState, signalTime, tripRefreshMs, type MapState } from '@/lib/trips/tracking';
import { cn } from '@/lib/utils';

const c = clientTripsCopy;

export const metadata: Metadata = { title: c.list.title };

function mapMessage(state: MapState, now: Date): string {
  switch (state.kind) {
    case 'notStarted':
      return c.map.notStarted;
    case 'finished':
      return c.map.finished;
    case 'waiting':
      return c.map.noLocationYet;
    case 'live':
      return c.map.lastSeen(signalTime(state.lastAt, now));
    case 'noSignal':
      return c.map.noSignalSince(signalTime(state.since, now));
  }
}

/** A line of text where a list would be (nothing yet). */
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="border bg-cell px-4 py-3.5 text-subhead text-text-dim">{children}</p>;
}

/**
 * One trip of the shipper (B15, V3): on the right a rail with the trip's four
 * steps, the agreed price, the delivery to confirm (the one primary, first)
 * and the cancellation; on the left who carries it, the live map, the
 * timeline and the incidents side by side, then the evidence, the documents
 * and the chat.
 */
export default async function TripPage({ params }: PageProps<'/cliente/viajes/[id]'>) {
  const { id } = await params;
  const { supabase, companyId } = await shipperContext(tripPath(id));
  const data = await getCompanyTrip(supabase, companyId, id);
  const viewer = await getViewer();
  const load = data?.trip.load;
  if (!data || !load || !viewer) notFound();
  const { trip, parties, events, incidents, evidence, documents, locations } = data;
  const [chat, sharedDocuments, decisions, endEstimate, siteDwells] = await Promise.all([
    data.conversationId ? getChat(supabase, data.conversationId, companyId) : null,
    getSharedDocuments(supabase, trip.id),
    getProviderDecisions(supabase, {
      shipperCompanyId: companyId,
      carrierCompanyIds: [trip.carrier_company_id],
    }),
    // H5: the estimated end of unloading and the times at the shipper's sites.
    tripEndEstimate(supabase, trip.id),
    ownSiteDwells(supabase, load),
  ]);
  const decision = decisions.get(trip.carrier_company_id) ?? null;

  const now = new Date();
  // The tracking can be shared with anyone, read-only, unless the trip is
  // cancelled or closed more than 24 hours ago (G7, D23); active links stay
  // listed (and revocable) anyway.
  const shareable = canShareTripTracking(trip, now);
  const shareLinks = await listActiveShareLinks(supabase, { tripId: trip.id });

  const last = locations.at(-1);
  const state = mapState(trip, last?.recorded_at ?? null, now);
  const live = state.kind === 'live' || state.kind === 'waiting' || state.kind === 'noSignal';
  // Also before departure, so the page notices when the unit leaves.
  const refreshMs = tripRefreshMs(state);
  const incidentsById = new Map(incidents.map((incident) => [incident.id, incident]));
  const d = c.detail;
  const cancellation =
    trip.status === 'cancelled'
      ? cancellationText(trip.cancellation_reason_code, trip.cancellation_reason)
      : null;

  return (
    <>
      {refreshMs !== null && <AutoRefresh intervalMs={refreshMs} />}
      <Link
        href={paths.shipperTrips}
        className={cn(buttonVariants({ variant: 'link' }), 'mb-4 gap-1 text-subhead')}
      >
        <ChevronLeft aria-hidden className="size-4" />
        {d.back}
      </Link>
      <PageHeader
        title={`${load.origin_city} → ${load.destination_city}`}
        status={<TripStatusBadge status={trip.status} />}
        description={parties?.carrierName}
        action={
          <>
            <Link
              href={loadPath(trip.load_id)}
              className={buttonVariants({ variant: 'secondary' })}
            >
              {d.load}
            </Link>
            {(shareable || shareLinks.length > 0) && (
              <ShareDialog
                kind="trip_tracking_public"
                targetId={trip.id}
                links={shareLinks}
                canCreate={shareable}
              />
            )}
          </>
        }
      />
      {cancellation && (
        <Notice tone="info" className="mb-8">
          {d.cancelled(cancellation)}
        </Notice>
      )}

      <DetailLayout
        rail={
          <div className="space-y-4">
            {/* The one primary of a delivered trip, first in the rail (§0.4). */}
            {trip.status === 'delivered' && (
              <ConfirmDeliveryForm tripId={trip.id} clientEventId={randomUUID()} />
            )}
            <DetailRail>
              <RailSection label={tripProgressCopy.label}>
                <Steps label={tripProgressCopy.label} steps={tripProgress(trip.status)} />
              </RailSection>
              {load.agreed_price_cents !== null && (
                <RailSection label={loadsCopy.detail.agreedPrice}>
                  <Money cents={load.agreed_price_cents} size="numeral" className="block" />
                </RailSection>
              )}
            </DetailRail>
            {canCancelTrip(trip.status) && (
              <TripCancelForm
                tripId={trip.id}
                action={cancelShipperTrip}
                onTheWay={cancelLeavesUnitPending(trip.status, trip.vehicle_id !== null)}
              />
            )}
          </div>
        }
      >
        <Group label={clientListsCopy.trip.assignment}>
          <ValueRow label={d.carrier}>
            <span className="inline-flex flex-wrap items-center justify-end gap-2">
              {parties?.carrierName}
              {parties && <VerificationBadge status={parties.carrierStatus} />}
            </span>
          </ValueRow>
          <ValueRow label={d.unit}>
            {parties?.plate
              ? d.unitValue(parties.unitType ? unitTypeLabels[parties.unitType] : '', parties.plate)
              : d.notAssigned}
          </ValueRow>
          <ValueRow label={d.operator}>{parties?.operatorName ?? d.notAssigned}</ValueRow>
          <TripEndRow estimate={endEstimate} />
        </Group>

        <PageSection title={c.map.title}>
          <TripMap
            origin={{ lat: load.origin_lat, lng: load.origin_lng, label: c.map.origin }}
            destination={{
              lat: load.destination_lat,
              lng: load.destination_lng,
              label: c.map.destination,
            }}
            trail={locations.map((p) => ({ lat: p.latitude, lng: p.longitude }))}
          />
          <div className="space-y-0.5">
            <p
              className={cn(
                'flex items-center gap-1.5 text-subhead',
                state.kind === 'noSignal' ? 'text-red-text' : 'text-text',
              )}
              role="status"
            >
              {state.kind === 'noSignal' && <CircleAlert aria-hidden className="size-4 shrink-0" />}
              {mapMessage(state, now)}
            </p>
            {live && <p className="text-footnote text-text-dim">{c.map.live}</p>}
          </div>
        </PageSection>

        <div className="grid gap-8 xl:grid-cols-2 xl:items-start">
          <PageSection title={c.timeline.title}>
            {events.length === 0 ? (
              <EmptyLine>{c.timeline.empty}</EmptyLine>
            ) : (
              <ol className="border bg-cell px-5 py-4">
                {events.map((event, index) => {
                  const incident = event.incident_id ? incidentsById.get(event.incident_id) : null;
                  // The latest event is where the trip is now.
                  const current = index === events.length - 1;
                  return (
                    <li key={event.id} className="relative pb-5 pl-6 last:pb-0">
                      {!current && (
                        <span
                          aria-hidden
                          className="absolute top-4 -bottom-0.5 left-0.75 w-px bg-separator"
                        />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          'absolute top-1.5 left-0 size-2 rounded-full',
                          current ? 'bg-accent' : 'bg-control',
                        )}
                      />
                      <div className="space-y-0.5">
                        <p
                          className={cn(
                            'text-subhead text-text',
                            current ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {tripEventTypeLabels[event.event_type]}
                        </p>
                        <time
                          className="block text-meta text-text-dim"
                          dateTime={event.occurred_at}
                        >
                          {formatDateTime(event.occurred_at)}
                        </time>
                        {event.estimated_unload_end_at && (
                          <p className="text-footnote text-text">
                            {c.timeline.estimate(formatDateTime(event.estimated_unload_end_at))}
                          </p>
                        )}
                        {incident && event.event_type === 'incident_reported' && (
                          <p className="text-footnote text-text-dim">
                            {c.timeline.incident(
                              incidentKindLabels[incident.kind],
                              incident.description,
                            )}
                          </p>
                        )}
                        {event.received_by_name && (
                          <p className="text-footnote text-text">
                            {c.timeline.receivedBy(event.received_by_name)}
                          </p>
                        )}
                        {event.notes && (
                          <p className="text-footnote text-text-dim">{event.notes}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </PageSection>

          <PageSection title={c.incidents.title}>
            <div className="space-y-3">
              {incidents.length === 0 ? (
                <EmptyLine>{c.incidents.empty}</EmptyLine>
              ) : (
                <Group>
                  <ul>
                    {incidents.map((incident) => (
                      <li key={incident.id} className={cn(groupRow, 'space-y-1 px-4 py-3')}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-subhead font-semibold text-text">
                            {incidentKindLabels[incident.kind]}
                          </p>
                          <Pill tone={incidentStatusTone(incident.status)}>
                            {incidentStatusLabels[incident.status]}
                          </Pill>
                        </div>
                        <p className="text-footnote text-text-dim">{incident.description}</p>
                        {incident.resolution && (
                          <p className="text-footnote text-text">
                            {c.incidents.resolution(incident.resolution)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Group>
              )}
              {trip.status !== 'cancelled' && (
                <ReportIncidentForm tripId={trip.id} clientEventId={randomUUID()} />
              )}
            </div>
          </PageSection>
        </div>

        <PageSection title={c.evidence.title} description={c.evidence.description}>
          {evidence.length === 0 ? (
            <EmptyLine>{c.evidence.empty}</EmptyLine>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {evidence.map((photo) => (
                <li key={photo.id} className="overflow-hidden border bg-cell">
                  <a
                    href={tripFileHref('evidencia', photo.storage_path)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={c.evidence.open}
                    className="block aspect-4/3 bg-surface-high focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text"
                  >
                    {/* The viewer route redirects to a short-lived signed URL of the private
                        bucket, so the src stays stable across refreshes; next/image cannot cache it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tripFileHref('evidencia', photo.storage_path)}
                      alt={evidenceStageLabels[photo.stage]}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                  <p className="space-y-0.5 px-3 py-2.5">
                    <span className="block text-subhead font-semibold text-text">
                      {evidenceStageLabels[photo.stage]}
                    </span>
                    <span className="block text-meta text-text-dim">
                      {c.evidence.capturedAt(formatDateTime(photo.captured_at))}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PageSection>

        {data.cargoInsurance && (
          <CargoInsuranceCard
            state={data.cargoInsurance}
            side="shipper"
            tripId={trip.id}
            canUpload={trip.status === 'pending_assignment' || trip.status === 'assigned'}
            companyHref={paths.shipperCompany}
          />
        )}

        <PageSection title={c.documents.title} description={c.documents.description}>
          <div className="space-y-4">
            <TripChecklist rows={data.checklist} cargoInsurance={data.cargoInsurance} />
            {trip.status !== 'cancelled' && (
              <TripDocumentUpload tripId={trip.id} kinds={data.uploadableKinds} />
            )}
            {documents.length === 0 ? (
              <EmptyLine>{c.documents.empty}</EmptyLine>
            ) : (
              <Group label={c.documents.files}>
                <ul>
                  {documents.map((doc) => (
                    <li key={doc.id} className={groupRow}>
                      <a
                        href={tripFileHref('documentos', doc.storage_path)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-table-row items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text"
                      >
                        <FileText aria-hidden className="size-4.5 shrink-0 text-text-dim" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-subhead font-medium text-accent-text">
                            {tripDocumentKindLabels[doc.kind]} · {doc.file_name}
                          </span>
                          <span className="block text-meta text-text-dim">
                            {c.documents.uploadedAt(formatDateTime(doc.created_at))}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Group>
            )}
          </div>
        </PageSection>

        <SharedDocumentsList rows={sharedDocuments} mode="client" />

        {chat && data.conversationId && (
          <PageSection title={c.chat.title} description={c.chat.description}>
            <ChatPanel
              conversationId={data.conversationId}
              viewerId={viewer.userId}
              ownCompanyUserIds={chat.ownCompanyUserIds}
              initialMessages={chat.messages}
              initialReads={chat.reads}
            />
          </PageSection>
        )}

        <SiteDwellGroup pickup={siteDwells.pickup} delivery={siteDwells.delivery} />

        <ProviderStatusForm
          carrierCompanyId={trip.carrier_company_id}
          status={decision?.status ?? null}
          decidedAt={decision?.decidedAt ?? null}
        />
      </DetailLayout>
    </>
  );
}
