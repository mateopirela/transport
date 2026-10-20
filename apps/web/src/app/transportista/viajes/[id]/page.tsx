import {
  canAddTripDocuments,
  canCancelTrip,
  cancelLeavesUnitPending,
  cancellationText,
  carrierTripsCopy,
  carrierWebCopy,
  chatCopy,
  sharedDocumentsCopy,
  clientTripsCopy,
  evidenceStageLabels,
  fleetCopy,
  formatDateTime,
  formatMxn,
  incidentKindLabels,
  incidentStatusLabels,
  tripDocumentKindLabels,
  tripEventTypeLabels,
} from '@transport/shared';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';

import { LoadDetails, loadRoute } from '@/components/carrier/load-details';
import { TripAssignForm } from '@/components/carrier/trip-assign-form';
import { ChatPanel } from '@/components/chat/chat-panel';
import { BackLink, PageSection } from '@/components/page-section';
import { ProviderBadge } from '@/components/shared-documents/provider-status';
import { SharedDocumentsList } from '@/components/shared-documents/shared-documents-list';
import { AutoRefresh } from '@/components/trips/auto-refresh';
import { ReportIncidentForm } from '@/components/trips/trip-actions';
import { TripCancelForm } from '@/components/trips/trip-cancel-form';
import { TripChecklist } from '@/components/trips/trip-checklist';
import { TripDocumentUpload } from '@/components/trips/trip-document-upload';
import { TripMap } from '@/components/trips/trip-map';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { ValueRow } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { Group, GroupLabel } from '@/components/ui/group';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { groupRow } from '@/components/ui/variants';
import { carrierContext } from '@/lib/carrier/context';
import {
  cancelCarrierTrip,
  registerCarrierTripDocument,
  reportCarrierIncident,
} from '@/lib/carrier/trip-actions';
import { getCarrierTrip } from '@/lib/carrier/trips';
import { getChat } from '@/lib/chat/queries';
import { carrierLoadPath, carrierTripPath, paths, tripFileHref } from '@/lib/routing';
import { getProviderDecisionForCarrier, getSharedDocuments } from '@/lib/shared-documents/queries';
import { mapState, signalTime, tripRefreshMs, type MapState } from '@/lib/trips/tracking';
import { cn } from '@/lib/utils';

const c = carrierWebCopy.trips;
const d = carrierTripsCopy.detail;
const m = clientTripsCopy.map;

export const metadata: Metadata = { title: d.title };

function mapMessage(state: MapState, now: Date): string {
  switch (state.kind) {
    case 'notStarted':
      return m.notStarted;
    case 'finished':
      return m.finished;
    case 'waiting':
      return m.noLocationYet;
    case 'live':
      return m.lastSeen(signalTime(state.lastAt, now));
    case 'noSignal':
      return m.noSignalSince(signalTime(state.since, now));
  }
}

/**
 * One won trip of the carrier (G10b; B20 on the app): the assignment of unit
 * and operator (until the operator departs), the live map, the timeline, the
 * evidence, the documents checklist (D22) with upload, the incidents, the
 * trip chat and the cancellation. Access is the business unit's (RLS, G1a).
 */
export default async function CarrierTripPage({ params }: PageProps<'/transportista/viajes/[id]'>) {
  const { id } = await params;
  const { supabase, viewer, companyId, isManager, units } = await carrierContext(
    carrierTripPath(id),
  );
  const data = await getCarrierTrip(
    supabase,
    { companyId, isManager, operableIds: units.operable.map((u) => u.id) },
    id,
  );
  if (!data || !data.load) {
    return (
      <>
        <BackLink href={paths.carrierTrips}>{c.detail.back}</BackLink>
        <Notice tone="info">{c.errors.notFound}</Notice>
      </>
    );
  }
  const { trip, load, events, incidents, evidence, documents, locations } = data;
  const [chat, sharedDocuments, decision] = await Promise.all([
    data.conversationId ? getChat(supabase, data.conversationId, companyId) : null,
    getSharedDocuments(supabase, trip.id),
    getProviderDecisionForCarrier(supabase, {
      shipperCompanyId: trip.shipper_company_id,
      carrierCompanyId: companyId,
    }),
  ]);

  const now = new Date();
  const last = locations.at(-1);
  const state = mapState(trip, last?.recorded_at ?? null, now);
  const live = state.kind === 'live' || state.kind === 'waiting' || state.kind === 'noSignal';
  const refreshMs = tripRefreshMs(state);
  const incidentsById = new Map(incidents.map((incident) => [incident.id, incident]));

  return (
    <>
      {refreshMs !== null && <AutoRefresh intervalMs={refreshMs} />}
      <BackLink href={paths.carrierTrips}>{c.detail.back}</BackLink>
      <PageHeader
        title={loadRoute(load)}
        status={<TripStatusBadge status={trip.status} />}
        description={
          data.businessUnitName ? fleetCopy.businessUnit(data.businessUnitName) : undefined
        }
        action={
          <Link
            href={carrierLoadPath(load.id)}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            {c.detail.load}
          </Link>
        }
      />
      {trip.status === 'cancelled' && (
        <Notice tone="error" className="mb-8">
          {d.cancelled(cancellationText(trip.cancellation_reason_code, trip.cancellation_reason))}
        </Notice>
      )}
      {trip.status === 'delivered' && (
        <Notice tone="info" className="mb-8">
          {d.delivered}
        </Notice>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          <PageSection title={c.detail.map}>
            <TripMap
              origin={{ lat: load.origin_lat, lng: load.origin_lng, label: m.origin }}
              destination={{
                lat: load.destination_lat,
                lng: load.destination_lng,
                label: m.destination,
              }}
              trail={locations.map((p) => ({ lat: p.latitude, lng: p.longitude }))}
            />
            <div className="space-y-0.5 px-1">
              <p
                className={cn(
                  'text-subhead',
                  state.kind === 'noSignal' ? 'text-red-text' : 'text-text',
                )}
                role="status"
              >
                {mapMessage(state, now)}
              </p>
              {live && <p className="text-footnote text-text-dim">{m.live}</p>}
            </div>
          </PageSection>

          <PageSection title={d.timeline}>
            {events.length === 0 ? (
              <Empty title={d.timelineEmpty} />
            ) : (
              // The timeline (§1.7): 8 px dots on a hairline, the latest step in the accent.
              <ol className="rounded-2xl border bg-cell px-4 py-3">
                {events.map((event, index) => {
                  const incident = event.incident_id ? incidentsById.get(event.incident_id) : null;
                  const latest = index === events.length - 1;
                  return (
                    <li key={event.id} className="relative pb-5 pl-6 last:pb-1">
                      {!latest && (
                        <span
                          aria-hidden
                          className="absolute top-4 bottom-0 left-0.75 w-px bg-separator"
                        />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          'absolute top-1.75 left-0 size-2 rounded-full',
                          latest ? 'bg-accent' : 'bg-text-faint',
                        )}
                      />
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className={cn('text-headline', latest ? 'text-text' : 'text-text-dim')}>
                          {tripEventTypeLabels[event.event_type]}
                        </p>
                        <time
                          className="text-footnote text-text-dim tabular-nums"
                          dateTime={event.occurred_at}
                        >
                          {formatDateTime(event.occurred_at)}
                        </time>
                      </div>
                      <div className="space-y-0.5 text-subhead">
                        {event.estimated_unload_end_at && (
                          <p className="text-text">
                            {c.detail.estimate(formatDateTime(event.estimated_unload_end_at))}
                          </p>
                        )}
                        {incident && event.event_type === 'incident_reported' && (
                          <p className="text-text-dim">
                            {c.detail.incidentReported(
                              incidentKindLabels[incident.kind],
                              incident.description,
                            )}
                          </p>
                        )}
                        {event.received_by_name && (
                          <p className="text-text">{c.detail.receivedBy(event.received_by_name)}</p>
                        )}
                        {event.notes && <p className="text-text-dim">{event.notes}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </PageSection>

          <PageSection title={c.detail.evidence}>
            {evidence.length === 0 ? (
              <Empty title={c.detail.evidenceEmpty} />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {evidence.map((photo) => {
                  const href = tripFileHref('evidencia', photo.storage_path, 'transportista');
                  return (
                    <li key={photo.id} className="overflow-hidden rounded-2xl border bg-cell">
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={c.detail.openPhoto}
                        className="block aspect-4/3 bg-surface-high"
                      >
                        {/* The viewer route redirects to a short-lived signed URL of the private
                            bucket, so the src stays stable across refreshes; next/image cannot cache it. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={href}
                          alt={evidenceStageLabels[photo.stage]}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                      <p className="px-3 py-2.5">
                        <span className="block text-subhead font-semibold text-text">
                          {evidenceStageLabels[photo.stage]}
                        </span>
                        <span className="block text-footnote text-text-dim tabular-nums">
                          {c.detail.capturedAt(formatDateTime(photo.captured_at))}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </PageSection>

          <PageSection
            title={carrierTripsCopy.documents.title}
            description={carrierTripsCopy.documents.help}
          >
            <TripChecklist rows={data.checklist} />
            {canAddTripDocuments(trip.status) ? (
              <TripDocumentUpload
                tripId={trip.id}
                kinds={data.uploadableKinds}
                registerAction={registerCarrierTripDocument}
                doneText={c.documents.done}
              />
            ) : (
              <p className="px-1 text-subhead text-text-dim">
                {carrierTripsCopy.documents.cancelled}
              </p>
            )}
            <div className="pt-3">
              <h3 className="mb-1.5 px-4 text-label text-text-dim">{c.detail.files}</h3>
              {documents.length === 0 ? (
                <p className="px-4 text-subhead text-text-dim">
                  {carrierTripsCopy.documents.empty}
                </p>
              ) : (
                <ul className="overflow-hidden rounded-2xl border bg-cell">
                  {documents.map((doc) => (
                    <li key={doc.id} className={groupRow}>
                      <a
                        href={tripFileHref('documentos', doc.storage_path, 'transportista')}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-12.5 items-center gap-3 px-4 py-2.5 outline-none hover:bg-surface-high/60 focus-visible:bg-surface-high"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-high text-text-dim">
                          <FileText aria-hidden className="size-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-accent-text">
                            {tripDocumentKindLabels[doc.kind]} · {doc.file_name}
                          </span>
                          <span className="block text-footnote text-text-dim tabular-nums">
                            {c.detail.uploadedAt(formatDateTime(doc.created_at))}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PageSection>

          <SharedDocumentsList rows={sharedDocuments} mode="carrier" canRevoke={isManager} />

          <PageSection
            title={d.chat}
            description={chat && data.conversationId ? chatCopy.description : undefined}
          >
            {chat && data.conversationId ? (
              <ChatPanel
                conversationId={data.conversationId}
                viewerId={viewer.userId}
                ownCompanyUserIds={chat.ownCompanyUserIds}
                initialMessages={chat.messages}
                initialReads={chat.reads}
                area="transportista"
              />
            ) : (
              <p className="px-1 text-subhead text-text-dim">{d.chatUnavailable}</p>
            )}
          </PageSection>
        </div>

        <aside className="space-y-8">
          <Group label={c.detail.assignment}>
            <div className="space-y-4 px-4 py-4">
              {data.unitName && data.operatorName && (
                <p className="text-headline text-text">
                  {carrierTripsCopy.assign.current(data.unitName, data.operatorName)}
                </p>
              )}
              {trip.status !== 'cancelled' && (
                <TripAssignForm
                  tripId={trip.id}
                  status={trip.status}
                  loadUnitType={load.unit_type}
                  loadRequirements={load.special_requirements}
                  current={{ vehicleId: trip.vehicle_id, operatorId: trip.operator_id }}
                  options={data.assignment}
                  isManager={isManager}
                />
              )}
            </div>
          </Group>

          <section className="space-y-3">
            <Group label={c.detail.data}>
              <ValueRow label={sharedDocumentsCopy.provider.status}>
                <ProviderBadge state={decision?.status ?? 'pending'} />
              </ValueRow>
              {decision?.notes && (
                <p className={`${groupRow} px-4 py-2.5 text-footnote text-text-dim`}>
                  {decision.notes}
                </p>
              )}
              {trip.estimated_unload_end_at && (
                <ValueRow label={d.unloadEstimate}>
                  {formatDateTime(trip.estimated_unload_end_at)}
                </ValueRow>
              )}
              {data.agreedPriceCents !== null && (
                <ValueRow label={d.agreedPrice}>{formatMxn(data.agreedPriceCents)}</ValueRow>
              )}
            </Group>
            <LoadDetails load={load} columns={1} />
          </section>

          <section className="space-y-3">
            <GroupLabel>{d.incidents}</GroupLabel>
            {incidents.length === 0 ? (
              <p className="px-4 text-subhead text-text-dim">{clientTripsCopy.incidents.empty}</p>
            ) : (
              <ul className="overflow-hidden rounded-2xl border bg-cell">
                {incidents.map((incident) => (
                  <li key={incident.id} className={`${groupRow} space-y-1 px-4 py-3`}>
                    <p className="text-headline text-text">
                      {incidentKindLabels[incident.kind]} · {incidentStatusLabels[incident.status]}
                    </p>
                    <p className="text-subhead text-text-dim">{incident.description}</p>
                    {incident.resolution && (
                      <p className="text-subhead text-text">
                        {clientTripsCopy.incidents.resolution(incident.resolution)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {trip.status !== 'cancelled' && (
              <ReportIncidentForm
                tripId={trip.id}
                clientEventId={randomUUID()}
                reportAction={reportCarrierIncident}
              />
            )}
          </section>

          {canCancelTrip(trip.status) && (
            <TripCancelForm
              tripId={trip.id}
              action={cancelCarrierTrip}
              onTheWay={cancelLeavesUnitPending(trip.status, trip.vehicle_id !== null)}
            />
          )}
        </aside>
      </div>
    </>
  );
}
