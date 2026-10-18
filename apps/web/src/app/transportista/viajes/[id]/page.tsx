import {
  canAddTripDocuments,
  canCancelTrip,
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
import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { LoadDetails, loadRoute } from '@/components/carrier/load-details';
import { TripAssignForm } from '@/components/carrier/trip-assign-form';
import { TripCancelForm } from '@/components/carrier/trip-cancel-form';
import { ChatPanel } from '@/components/chat/chat-panel';
import { ProviderBadge } from '@/components/shared-documents/provider-status';
import { SharedDocumentsList } from '@/components/shared-documents/shared-documents-list';
import { AutoRefresh } from '@/components/trips/auto-refresh';
import { ReportIncidentForm } from '@/components/trips/trip-actions';
import { TripChecklist } from '@/components/trips/trip-checklist';
import { TripDocumentUpload } from '@/components/trips/trip-document-upload';
import { TripMap } from '@/components/trips/trip-map';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { carrierContext } from '@/lib/carrier/context';
import { registerCarrierTripDocument, reportCarrierIncident } from '@/lib/carrier/trip-actions';
import { getCarrierTrip } from '@/lib/carrier/trips';
import { getChat } from '@/lib/chat/queries';
import { carrierLoadPath, carrierTripPath, paths, tripFileHref } from '@/lib/routing';
import { getProviderDecisionForCarrier, getSharedDocuments } from '@/lib/shared-documents/queries';
import { mapState, signalTime, tripRefreshMs, type MapState } from '@/lib/trips/tracking';

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
        <Link href={paths.carrierTrips} className="text-sm text-accent hover:underline">
          {c.detail.back}
        </Link>
        <div className="mt-4">
          <Notice tone="info">{c.errors.notFound}</Notice>
        </div>
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
      <Link href={paths.carrierTrips} className="text-sm text-accent hover:underline">
        {c.detail.back}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={loadRoute(load)}
          description={
            data.businessUnitName ? fleetCopy.businessUnit(data.businessUnitName) : undefined
          }
        />
        <div className="flex items-center gap-3 text-sm">
          <TripStatusBadge status={trip.status} />
          <Link href={carrierLoadPath(load.id)} className="text-accent hover:underline">
            {c.detail.load}
          </Link>
        </div>
      </div>
      {trip.status === 'cancelled' && (
        <div className="mb-6">
          <Notice tone="error">{d.cancelled(trip.cancellation_reason)}</Notice>
        </div>
      )}
      {trip.status === 'delivered' && (
        <div className="mb-6">
          <Notice tone="info">{d.delivered}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-2xl">{c.detail.map}</h2>
            <TripMap
              origin={{ lat: load.origin_lat, lng: load.origin_lng, label: m.origin }}
              destination={{
                lat: load.destination_lat,
                lng: load.destination_lng,
                label: m.destination,
              }}
              trail={locations.map((p) => ({ lat: p.latitude, lng: p.longitude }))}
            />
            <p
              className={state.kind === 'noSignal' ? 'text-sm text-destructive' : 'text-sm'}
              role="status"
            >
              {mapMessage(state, now)}
            </p>
            {live && <p className="text-xs text-muted-foreground">{m.live}</p>}
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{d.timeline}</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{d.timelineEmpty}</p>
            ) : (
              <ol className="divide-y rounded-xl border bg-card">
                {events.map((event) => {
                  const incident = event.incident_id ? incidentsById.get(event.incident_id) : null;
                  return (
                    <li key={event.id} className="space-y-1 p-4 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{tripEventTypeLabels[event.event_type]}</p>
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={event.occurred_at}
                        >
                          {formatDateTime(event.occurred_at)}
                        </time>
                      </div>
                      {event.estimated_unload_end_at && (
                        <p>{c.detail.estimate(formatDateTime(event.estimated_unload_end_at))}</p>
                      )}
                      {incident && event.event_type === 'incident_reported' && (
                        <p className="text-muted-foreground">
                          {c.detail.incidentReported(
                            incidentKindLabels[incident.kind],
                            incident.description,
                          )}
                        </p>
                      )}
                      {event.received_by_name && (
                        <p>{c.detail.receivedBy(event.received_by_name)}</p>
                      )}
                      {event.notes && <p className="text-muted-foreground">{event.notes}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{c.detail.evidence}</h2>
            {evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.detail.evidenceEmpty}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {evidence.map((photo) => {
                  const href = tripFileHref('evidencia', photo.storage_path, 'transportista');
                  return (
                    <li
                      key={photo.id}
                      className="overflow-hidden rounded-lg border bg-card text-xs"
                    >
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={c.detail.openPhoto}
                        className="block aspect-[4/3] bg-muted"
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
                      <p className="p-2">
                        <span className="font-medium">{evidenceStageLabels[photo.stage]}</span>
                        <br />
                        <span className="text-muted-foreground">
                          {c.detail.capturedAt(formatDateTime(photo.captured_at))}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{carrierTripsCopy.documents.title}</h2>
            <p className="text-sm text-muted-foreground">{carrierTripsCopy.documents.help}</p>
            <TripChecklist rows={data.checklist} />
            {canAddTripDocuments(trip.status) ? (
              <TripDocumentUpload
                tripId={trip.id}
                kinds={data.uploadableKinds}
                registerAction={registerCarrierTripDocument}
                doneText={c.documents.done}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {carrierTripsCopy.documents.cancelled}
              </p>
            )}
            <h3 className="text-lg">{c.detail.files}</h3>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{carrierTripsCopy.documents.empty}</p>
            ) : (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 p-4"
                  >
                    <a
                      href={tripFileHref('documentos', doc.storage_path, 'transportista')}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      {tripDocumentKindLabels[doc.kind]} · {doc.file_name}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {c.detail.uploadedAt(formatDateTime(doc.created_at))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SharedDocumentsList rows={sharedDocuments} mode="carrier" canRevoke={isManager} />

          <section className="space-y-3">
            <h2 className="text-2xl">{d.chat}</h2>
            {chat && data.conversationId ? (
              <>
                <p className="text-sm text-muted-foreground">{chatCopy.description}</p>
                <ChatPanel
                  conversationId={data.conversationId}
                  viewerId={viewer.userId}
                  ownCompanyUserIds={chat.ownCompanyUserIds}
                  initialMessages={chat.messages}
                  initialReads={chat.reads}
                  area="transportista"
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{d.chatUnavailable}</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-xl">{c.detail.assignment}</h2>
            {data.unitName && data.operatorName && (
              <p className="text-sm font-medium">
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
          </section>

          <section className="space-y-3">
            <h2 className="text-xl">{c.detail.data}</h2>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{sharedDocumentsCopy.provider.status}: </span>
              <ProviderBadge state={decision?.status ?? 'pending'} />
            </p>
            {decision?.notes && <p className="text-xs text-muted-foreground">{decision.notes}</p>}
            {trip.estimated_unload_end_at && (
              <p className="text-sm">
                <span className="text-muted-foreground">{d.unloadEstimate}: </span>
                <span className="font-medium">{formatDateTime(trip.estimated_unload_end_at)}</span>
              </p>
            )}
            {data.agreedPriceCents !== null && (
              <p className="text-sm">
                <span className="text-muted-foreground">{d.agreedPrice}: </span>
                <span className="font-medium">{formatMxn(data.agreedPriceCents)}</span>
              </p>
            )}
            <LoadDetails load={load} />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl">{d.incidents}</h2>
            {incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{clientTripsCopy.incidents.empty}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {incidents.map((incident) => (
                  <li key={incident.id} className="space-y-1 rounded-lg border bg-card p-3">
                    <p className="font-medium">
                      {incidentKindLabels[incident.kind]} · {incidentStatusLabels[incident.status]}
                    </p>
                    <p className="text-muted-foreground">{incident.description}</p>
                    {incident.resolution && (
                      <p>{clientTripsCopy.incidents.resolution(incident.resolution)}</p>
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

          {canCancelTrip(trip.status) && <TripCancelForm tripId={trip.id} />}
        </aside>
      </div>
    </>
  );
}
