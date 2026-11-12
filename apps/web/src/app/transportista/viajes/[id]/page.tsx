import {
  BACKHAUL_SECTION_ID,
  backhaulCopy,
  canAddTripDocuments,
  canCancelTrip,
  canSendTripLink,
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
  INTERNAL_CHAT_PARAM,
  incidentKindLabels,
  internalChatCopy,
  incidentStatusLabels,
  tripChatTab,
  tripDocumentKindLabels,
  tripEventTypeLabels,
} from '@transport/shared';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';

import { LoadDetails, loadRoute } from '@/components/carrier/load-details';
import { RECOMMENDATION_LIST, RecommendationCard } from '@/components/carrier/recommendation-card';
import { SectionAnchors } from '@/components/carrier/section-anchors';
import { TripAssignForm } from '@/components/carrier/trip-assign-form';
import { TripLinkPanel } from '@/components/carrier/trip-link-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { BackLink, PageSection } from '@/components/page-section';
import { ProviderBadge } from '@/components/shared-documents/provider-status';
import { SharedDocumentsList } from '@/components/shared-documents/shared-documents-list';
import { AutoRefresh } from '@/components/trips/auto-refresh';
import { TripEndRow } from '@/components/trips/site-dwell';
import { ReportIncidentForm } from '@/components/trips/trip-actions';
import { TripCancelForm } from '@/components/trips/trip-cancel-form';
import { CargoInsuranceCard } from '@/components/trips/cargo-insurance-card';
import { TripChecklist } from '@/components/trips/trip-checklist';
import { TripDocumentUpload } from '@/components/trips/trip-document-upload';
import { TripMap } from '@/components/trips/trip-map';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { ValueRow } from '@/components/ui/cell';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Steps } from '@/components/ui/steps';
import { groupRow } from '@/components/ui/variants';
import { tripBackhaul } from '@/lib/carrier/backhaul';
import { carrierContext } from '@/lib/carrier/context';
import {
  cancelCarrierTrip,
  registerCarrierTripDocument,
  reportCarrierIncident,
} from '@/lib/carrier/trip-actions';
import { getCarrierTrip } from '@/lib/carrier/trips';
import { getChat } from '@/lib/chat/queries';
import { tripEndEstimate } from '@/lib/dwell';
import { carrierLoadPath, carrierTripPath, paths, tripFileHref } from '@/lib/routing';
import { activeTripOperatorLink } from '@/lib/share-links/queries';
import { getProviderDecisionForCarrier, getSharedDocuments } from '@/lib/shared-documents/queries';
import { mapState, signalTime, tripRefreshMs, type MapState } from '@/lib/trips/tracking';
import { cn } from '@/lib/utils';

const c = carrierWebCopy.trips;
const d = carrierTripsCopy.detail;
const m = clientTripsCopy.map;

export const metadata: Metadata = { title: d.title };

/** The anchors of the trip's long sections; the return loads keep BACKHAUL_SECTION_ID. */
const SECTION = {
  map: 'ubicacion',
  timeline: 'avance',
  evidence: 'evidencia',
  documents: 'documentos',
  incidents: 'incidencias',
  chat: 'chat',
} as const;

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
 * Two columns (docs/plan-fulmis.md §1.5): the sections, with anchors over
 * them, and a rail with the state, the price and the assignment.
 * The chat has two tabs (H1): "Cliente" and the internal one with the
 * operator, "Interno" (`?chat=interno`, where its notifications lead).
 */
export default async function CarrierTripPage({
  params,
  searchParams,
}: PageProps<'/transportista/viajes/[id]'>) {
  const { id } = await params;
  const requestedTab = tripChatTab((await searchParams).chat);
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
  const chatTab = data.internalConversationId ? requestedTab : 'shipper';
  const chatId = chatTab === 'internal' ? data.internalConversationId : data.conversationId;
  // H2: "Enviar viaje al operador", while the operator has the trip in hand.
  const sendsLink =
    data.operatorName !== null &&
    !data.soloOwnerOperator &&
    canSendTripLink({ status: trip.status, operatorId: trip.operator_id });
  const [chat, sharedDocuments, decision, endEstimate, tripLink, backhaul] = await Promise.all([
    chatId ? getChat(supabase, chatId, companyId) : null,
    getSharedDocuments(supabase, trip.id),
    getProviderDecisionForCarrier(supabase, {
      shipperCompanyId: trip.shipper_company_id,
      carrierCompanyId: companyId,
    }),
    // H5: the estimated end of unloading, with the times measured at the site.
    tripEndEstimate(supabase, id),
    sendsLink ? activeTripOperatorLink(supabase, trip.id) : null,
    // I7 (D40): the return loads, once the trip arrived or came near its destination.
    tripBackhaul(supabase, trip),
  ]);

  const now = new Date();
  const last = locations.at(-1);
  const state = mapState(trip, last?.recorded_at ?? null, now);
  const live = state.kind === 'live' || state.kind === 'waiting' || state.kind === 'noSignal';
  const refreshMs = tripRefreshMs(state);
  const incidentsById = new Map(incidents.map((incident) => [incident.id, incident]));

  const finished = trip.status === 'delivered' || trip.status === 'cancelled';
  const sections = [
    { id: SECTION.map, label: c.detail.map },
    ...(backhaul ? [{ id: BACKHAUL_SECTION_ID, label: backhaulCopy.section }] : []),
    { id: SECTION.timeline, label: d.timeline },
    { id: SECTION.evidence, label: c.detail.evidence },
    { id: SECTION.documents, label: c.detail.documents },
    { id: SECTION.incidents, label: d.incidents },
    { id: SECTION.chat, label: c.detail.chat },
  ];

  // The rail (§1.5): the state, the agreed price and the assignment, whose
  // button is the primary until the operator departs; then the trip link and
  // the cancellation.
  const rail = (
    <div className="space-y-6">
      <DetailRail>
        <RailSection label={d.status}>
          <TripStatusBadge status={trip.status} />
          {data.businessUnitName && (
            <p className="text-footnote text-text-dim">
              {fleetCopy.businessUnit(data.businessUnitName)}
            </p>
          )}
        </RailSection>
        {data.agreedPriceCents !== null && (
          <RailSection label={d.agreedPrice}>
            <Money cents={data.agreedPriceCents} size="numeral" className="block" />
          </RailSection>
        )}
        <RailSection label={c.detail.assignment}>
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
        </RailSection>
      </DetailRail>

      {sendsLink && data.operatorName && (
        <TripLinkPanel
          tripId={trip.id}
          operatorName={data.operatorName}
          operatorPhone={data.operatorPhone}
          route={loadRoute(load)}
          active={tripLink}
        />
      )}

      {canCancelTrip(trip.status) && (
        <TripCancelForm
          tripId={trip.id}
          action={cancelCarrierTrip}
          onTheWay={cancelLeavesUnitPending(trip.status, trip.vehicle_id !== null)}
        />
      )}
    </div>
  );

  return (
    <>
      {refreshMs !== null && <AutoRefresh intervalMs={refreshMs} />}
      <BackLink href={paths.carrierTrips}>{c.detail.back}</BackLink>
      <PageHeader
        title={loadRoute(load)}
        status={<TripStatusBadge status={trip.status} />}
        description={`${load.origin_city}, ${load.origin_state} → ${load.destination_city}, ${load.destination_state}`}
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

      <DetailLayout rail={rail}>
        <SectionAnchors label={c.detail.sections} items={sections} />

        <PageSection id={SECTION.map} title={c.detail.map}>
          <TripMap
            origin={{ lat: load.origin_lat, lng: load.origin_lng, label: m.origin }}
            destination={{
              lat: load.destination_lat,
              lng: load.destination_lng,
              label: m.destination,
            }}
            trail={locations.map((p) => ({ lat: p.latitude, lng: p.longitude }))}
          />
          <div className="space-y-0.5">
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

        {backhaul && (
          <PageSection
            id={BACKHAUL_SECTION_ID}
            title={backhaulCopy.section}
            description={backhaulCopy.description(
              load.destination_city,
              backhaul.availableFrom ? formatDateTime(backhaul.availableFrom) : null,
            )}
          >
            {backhaul.suggestions.length === 0 ? (
              <Empty title={backhaulCopy.empty} />
            ) : (
              <ul className={RECOMMENDATION_LIST}>
                {backhaul.suggestions.map((r, i) => (
                  <RecommendationCard key={r.loadId} recommendation={r} rank={i + 1} />
                ))}
              </ul>
            )}
          </PageSection>
        )}

        <PageSection id={SECTION.timeline} title={d.timeline}>
          {events.length === 0 ? (
            <Empty title={d.timelineEmpty} />
          ) : (
            <div className="border bg-cell px-5 py-4">
              <Steps
                label={d.timeline}
                steps={events.map((event, index) => {
                  const incident = event.incident_id ? incidentsById.get(event.incident_id) : null;
                  const lines = [
                    event.estimated_unload_end_at
                      ? c.detail.estimate(formatDateTime(event.estimated_unload_end_at))
                      : null,
                    incident && event.event_type === 'incident_reported'
                      ? c.detail.incidentReported(
                          incidentKindLabels[incident.kind],
                          incident.description,
                        )
                      : null,
                    event.received_by_name ? c.detail.receivedBy(event.received_by_name) : null,
                    event.notes,
                  ].filter((line): line is string => Boolean(line));
                  const current = index === events.length - 1 && !finished;
                  return {
                    label: tripEventTypeLabels[event.event_type],
                    description:
                      lines.length > 0
                        ? lines.map((line) => (
                            <span key={line} className="block">
                              {line}
                            </span>
                          ))
                        : undefined,
                    meta: (
                      <time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time>
                    ),
                    state: current ? 'current' : 'done',
                  };
                })}
              />
            </div>
          )}
        </PageSection>

        <PageSection id={SECTION.evidence} title={c.detail.evidence}>
          {evidence.length === 0 ? (
            <Empty title={c.detail.evidenceEmpty} />
          ) : (
            <ul className="grid grid-cols-2 gap-px border bg-separator sm:grid-cols-3">
              {evidence.map((photo) => {
                const href = tripFileHref('evidencia', photo.storage_path, 'transportista');
                return (
                  <li key={photo.id} className="bg-cell">
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={c.detail.openPhoto}
                      className="block aspect-4/3 bg-surface-high focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text"
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
                      <span className="block text-meta text-text-dim">
                        {c.detail.capturedAt(formatDateTime(photo.captured_at))}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </PageSection>

        {data.cargoInsurance && (
          <CargoInsuranceCard state={data.cargoInsurance} side="carrier" tripId={trip.id} />
        )}

        <PageSection
          id={SECTION.documents}
          title={carrierTripsCopy.documents.title}
          description={carrierTripsCopy.documents.help}
        >
          <TripChecklist rows={data.checklist} cargoInsurance={data.cargoInsurance} />
          {canAddTripDocuments(trip.status) ? (
            <TripDocumentUpload
              tripId={trip.id}
              kinds={data.uploadableKinds}
              registerAction={registerCarrierTripDocument}
              doneText={c.documents.done}
            />
          ) : (
            <p className="text-subhead text-text-dim">{carrierTripsCopy.documents.cancelled}</p>
          )}
          <Group label={c.detail.files} className="pt-3">
            {documents.length === 0 ? (
              <p className="px-4 py-3 text-subhead text-text-dim">
                {carrierTripsCopy.documents.empty}
              </p>
            ) : (
              <ul>
                {documents.map((doc) => (
                  <li key={doc.id} className={groupRow}>
                    <a
                      href={tripFileHref('documentos', doc.storage_path, 'transportista')}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-table-row items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text"
                    >
                      <FileText aria-hidden className="size-4.5 shrink-0 text-text-dim" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-subhead text-accent-text">
                          {tripDocumentKindLabels[doc.kind]} · {doc.file_name}
                        </span>
                        <span className="block text-meta text-text-dim">
                          {c.detail.uploadedAt(formatDateTime(doc.created_at))}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </PageSection>

        <SharedDocumentsList rows={sharedDocuments} mode="carrier" canRevoke={isManager} />

        <PageSection title={c.detail.data}>
          <Group>
            <ValueRow label={sharedDocumentsCopy.provider.status}>
              <ProviderBadge state={decision?.status ?? 'pending'} />
            </ValueRow>
            {decision?.notes && (
              <p className={`${groupRow} px-4 py-2.5 text-footnote text-text-dim`}>
                {decision.notes}
              </p>
            )}
            <TripEndRow estimate={endEstimate} />
          </Group>
          <LoadDetails load={load} />
        </PageSection>

        <PageSection id={SECTION.incidents} title={d.incidents}>
          {incidents.length === 0 ? (
            <p className="text-subhead text-text-dim">{clientTripsCopy.incidents.empty}</p>
          ) : (
            <ul className="divide-y divide-separator border bg-cell">
              {incidents.map((incident) => (
                <li key={incident.id} className="space-y-1 px-4 py-3">
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
        </PageSection>

        <PageSection
          id={SECTION.chat}
          title={d.chat}
          description={
            chat && chatId
              ? chatTab === 'internal'
                ? internalChatCopy.staffDescription
                : chatCopy.description
              : undefined
          }
        >
          {data.internalConversationId && (
            <Segmented
              label={internalChatCopy.tabs.label}
              value={chatTab}
              items={[
                {
                  value: 'shipper',
                  label: internalChatCopy.tabs.shipper,
                  href: carrierTripPath(trip.id),
                },
                {
                  value: 'internal',
                  label: internalChatCopy.tabs.internal,
                  href: `${carrierTripPath(trip.id)}?chat=${INTERNAL_CHAT_PARAM}`,
                },
              ]}
            />
          )}
          {chat && chatId ? (
            <ChatPanel
              key={chatId}
              conversationId={chatId}
              viewerId={viewer.userId}
              // In the internal chat everyone is of the company: any other reader counts.
              ownCompanyUserIds={chatTab === 'internal' ? [viewer.userId] : chat.ownCompanyUserIds}
              initialMessages={chat.messages}
              initialReads={chat.reads}
              area="transportista"
              internal={chatTab === 'internal'}
            />
          ) : (
            <p className="text-subhead text-text-dim">{d.chatUnavailable}</p>
          )}
        </PageSection>
      </DetailLayout>
    </>
  );
}
