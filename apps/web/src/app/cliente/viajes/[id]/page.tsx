import {
  canShareTripTracking,
  clientTripsCopy,
  evidenceStageLabels,
  formatDateTime,
  formatMxn,
  incidentKindLabels,
  incidentStatusLabels,
  tripDocumentKindLabels,
  tripEventTypeLabels,
  unitTypeLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { ChatPanel } from '@/components/chat/chat-panel';
import { VerificationBadge } from '@/components/offers/offer-board';
import { ShareDialog } from '@/components/share/share-dialog';
import { AutoRefresh } from '@/components/trips/auto-refresh';
import { ConfirmDeliveryForm, ReportIncidentForm } from '@/components/trips/trip-actions';
import { TripChecklist } from '@/components/trips/trip-checklist';
import { TripDocumentUpload } from '@/components/trips/trip-document-upload';
import { TripMap } from '@/components/trips/trip-map';
import { ProviderStatusForm } from '@/components/shared-documents/provider-status';
import { SharedDocumentsList } from '@/components/shared-documents/shared-documents-list';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { getChat } from '@/lib/chat/queries';
import { shipperContext } from '@/lib/loads/queries';
import { loadPath, paths, tripFileHref, tripPath } from '@/lib/routing';
import { getViewer } from '@/lib/session';
import { listActiveShareLinks } from '@/lib/share-links/queries';
import { getProviderDecisions, getSharedDocuments } from '@/lib/shared-documents/queries';
import { getCompanyTrip } from '@/lib/trips/queries';
import { mapState, signalTime, tripRefreshMs, type MapState } from '@/lib/trips/tracking';

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

/** One trip of the shipper: live map, timeline, evidence, documents, actions and chat (B15). */
export default async function TripPage({ params }: PageProps<'/cliente/viajes/[id]'>) {
  const { id } = await params;
  const { supabase, companyId } = await shipperContext(tripPath(id));
  const data = await getCompanyTrip(supabase, companyId, id);
  const viewer = await getViewer();
  if (!data?.trip.load || !viewer) notFound();
  const { trip, parties, events, incidents, evidence, documents, locations } = data;
  const load = trip.load;
  const [chat, sharedDocuments, decisions] = await Promise.all([
    data.conversationId ? getChat(supabase, data.conversationId, companyId) : null,
    getSharedDocuments(supabase, trip.id),
    getProviderDecisions(supabase, {
      shipperCompanyId: companyId,
      carrierCompanyIds: [trip.carrier_company_id],
    }),
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

  return (
    <>
      {refreshMs !== null && <AutoRefresh intervalMs={refreshMs} />}
      <Link href={paths.shipperTrips} className="text-sm text-accent hover:underline">
        {d.back}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={`${load.origin_city} → ${load.destination_city}`}
          description={
            load.agreed_price_cents === null
              ? undefined
              : d.agreedPrice(formatMxn(load.agreed_price_cents))
          }
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <TripStatusBadge status={trip.status} />
          <Link href={loadPath(trip.load_id)} className="text-accent hover:underline">
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
        </div>
      </div>
      {trip.cancellation_reason && (
        <div className="mb-6">
          <Notice tone="info">{d.cancelled(trip.cancellation_reason)}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-2xl">{c.map.title}</h2>
            <TripMap
              origin={{ lat: load.origin_lat, lng: load.origin_lng, label: c.map.origin }}
              destination={{
                lat: load.destination_lat,
                lng: load.destination_lng,
                label: c.map.destination,
              }}
              trail={locations.map((p) => ({ lat: p.latitude, lng: p.longitude }))}
            />
            <p
              className={state.kind === 'noSignal' ? 'text-sm text-destructive' : 'text-sm'}
              role="status"
            >
              {mapMessage(state, now)}
            </p>
            {live && <p className="text-xs text-muted-foreground">{c.map.live}</p>}
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{c.timeline.title}</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.timeline.empty}</p>
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
                        <p>{c.timeline.estimate(formatDateTime(event.estimated_unload_end_at))}</p>
                      )}
                      {incident && event.event_type === 'incident_reported' && (
                        <p className="text-muted-foreground">
                          {c.timeline.incident(
                            incidentKindLabels[incident.kind],
                            incident.description,
                          )}
                        </p>
                      )}
                      {event.received_by_name && (
                        <p>{c.timeline.receivedBy(event.received_by_name)}</p>
                      )}
                      {event.notes && <p className="text-muted-foreground">{event.notes}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{c.evidence.title}</h2>
            <p className="text-sm text-muted-foreground">{c.evidence.description}</p>
            {evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.evidence.empty}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {evidence.map((photo) => (
                  <li key={photo.id} className="overflow-hidden rounded-lg border bg-card text-xs">
                    <a
                      href={tripFileHref('evidencia', photo.storage_path)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={c.evidence.open}
                      className="block aspect-[4/3] bg-muted"
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
                    <p className="p-2">
                      <span className="font-medium">{evidenceStageLabels[photo.stage]}</span>
                      <br />
                      <span className="text-muted-foreground">
                        {c.evidence.capturedAt(formatDateTime(photo.captured_at))}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{c.documents.title}</h2>
            <p className="text-sm text-muted-foreground">{c.documents.description}</p>
            <TripChecklist rows={data.checklist} />
            {trip.status !== 'cancelled' && (
              <TripDocumentUpload tripId={trip.id} kinds={data.uploadableKinds} />
            )}
            <h3 className="text-lg">{c.documents.files}</h3>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.documents.empty}</p>
            ) : (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 p-4"
                  >
                    <a
                      href={tripFileHref('documentos', doc.storage_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      {tripDocumentKindLabels[doc.kind]} · {doc.file_name}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {c.documents.uploadedAt(formatDateTime(doc.created_at))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SharedDocumentsList rows={sharedDocuments} mode="client" />

          {chat && data.conversationId && (
            <section className="space-y-3">
              <h2 className="text-2xl">{c.chat.title}</h2>
              <p className="text-sm text-muted-foreground">{c.chat.description}</p>
              <ChatPanel
                conversationId={data.conversationId}
                viewerId={viewer.userId}
                ownCompanyUserIds={chat.ownCompanyUserIds}
                initialMessages={chat.messages}
                initialReads={chat.reads}
              />
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{d.carrier}</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium">
                {parties?.carrierName}
                {parties && <VerificationBadge status={parties.carrierStatus} />}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{d.unit}</dt>
              <dd>
                {parties?.plate
                  ? d.unitValue(
                      parties.unitType ? unitTypeLabels[parties.unitType] : '',
                      parties.plate,
                    )
                  : d.notAssigned}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{d.operator}</dt>
              <dd>{parties?.operatorName ?? d.notAssigned}</dd>
            </div>
            {trip.estimated_unload_end_at && (
              <div>
                <dt className="text-xs text-muted-foreground">{d.unloadEstimate}</dt>
                <dd className="font-medium">{formatDateTime(trip.estimated_unload_end_at)}</dd>
              </div>
            )}
          </dl>

          <ProviderStatusForm
            carrierCompanyId={trip.carrier_company_id}
            status={decision?.status ?? null}
            decidedAt={decision?.decidedAt ?? null}
          />

          {trip.status === 'delivered' && (
            <ConfirmDeliveryForm tripId={trip.id} clientEventId={randomUUID()} />
          )}

          <section className="space-y-3">
            <h2 className="text-xl">{c.incidents.title}</h2>
            {incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.incidents.empty}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {incidents.map((incident) => (
                  <li key={incident.id} className="space-y-1 rounded-lg border bg-card p-3">
                    <p className="font-medium">
                      {incidentKindLabels[incident.kind]} · {incidentStatusLabels[incident.status]}
                    </p>
                    <p className="text-muted-foreground">{incident.description}</p>
                    {incident.resolution && <p>{c.incidents.resolution(incident.resolution)}</p>}
                  </li>
                ))}
              </ul>
            )}
            {trip.status !== 'cancelled' && (
              <ReportIncidentForm tripId={trip.id} clientEventId={randomUUID()} />
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
