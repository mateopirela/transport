import {
  backhaulCopy,
  canCancelTrip,
  canSendTripLink,
  cargoTypeLabels,
  carrierTripsCopy,
  dwellCopy,
  formatDateTime,
  hidesInternalChat,
  internalChatCopy,
  isTripActive,
  mapPointUrl,
  supportCopy,
  tripChatTab,
  tripFolio,
  tripStatusLabels,
  tripStatusTone,
  type TripChatTab,
  type TripEndEstimate,
} from '@transport/shared';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { KeyboardBottomBar } from '../../../components/keyboard-bar';
import { ChatPanel } from '../../../components/chat-panel';
import { DetailRow } from '../../../components/detail-row';
import { CargoInsuranceSection } from '../../../components/cargo-insurance-section';
import { HelpCell } from '../../../components/help-cell';
import { RecommendationCell } from '../../../components/load-card';
import { SharedDocumentsSection } from '../../../components/shared-documents-section';
import { useTripAssignment } from '../../../components/trip-assign-form';
import { TripCancelSection } from '../../../components/trip-cancel-section';
import { TripDocumentsSection } from '../../../components/trip-documents-section';
import { TripLinkSection } from '../../../components/trip-link-section';
import { TripHeading, TripSteps } from '../../../components/operator-trip';
import { TripMap } from '../../../components/trip-map';
import { PositionLine } from '../../../components/trip-position';
import { IncidentList, TimelineSection } from '../../../components/trip-sections';
import {
  Cell,
  Footnote,
  Group,
  LoadError,
  Money,
  Notice,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
  TextCell,
} from '../../../components/ui';
import { tripBackhaul, type TripBackhaul } from '../../../lib/backhaul-api';
import { loadCarrierTrip, type CarrierTripDetail } from '../../../lib/carrier-trips-api';
import { tripEndEstimate } from '../../../lib/dwell-api';
import { nextStep, stepDetails } from '../../../lib/next-step';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { usePolling } from '../../../lib/use-polling';
import { useSession } from '../../../providers/session';

const copy = carrierTripsCopy.detail;

/**
 * A won trip for the carrier (B20): its folio, status and route over the four
 * steps of the trip (the operator's, V7) and the agreed price, the map while
 * it is on the road, "Asignar operador" in the bottom bar until the operator departs,
 * the documents, what is shared with the shipper and its provider status
 * (G6), the timeline, incidents, evidence, the trip chat ("Cliente" and the
 * internal one with the operator, "Interno": H1; `?chat=interno` opens it)
 * and the cancellation with a reason (G5).
 */
export default function CarrierTripScreen() {
  const { id, chat } = useLocalSearchParams<{ id: string; chat?: string }>();
  const load = useCallback(
    async ({ client, companyId, isManager }: CarrierContext) => {
      // H5: the estimated end of unloading, with the times measured at the site.
      const [detail, endEstimate] = await Promise.all([
        loadCarrierTrip(client, companyId, id, isManager),
        tripEndEstimate(client, id),
      ]);
      if (!detail) return null;
      // I7 (D40): the return loads, once the trip arrived or came near its destination.
      const backhaul = await tripBackhaul(client, detail.trip);
      return { ...detail, endEstimate, backhaul };
    },
    [id],
  );
  const { carrier, state, reload } = useCarrierData(load);
  const refresh = useCallback(() => void reload(), [reload]);
  usePolling(refresh);

  const header = <Stack.Screen options={{ title: copy.title }} />;
  if (state.status !== 'ready' || !carrier || !state.data) {
    return (
      <Screen belowHeader>
        {header}
        {state.status === 'error' ? (
          <LoadError onRetry={refresh} />
        ) : state.status === 'ready' && carrier ? (
          <Notice tone="warning">{copy.notFound}</Notice>
        ) : (
          <Skeleton />
        )}
      </Screen>
    );
  }
  return (
    <>
      {header}
      <TripBody
        carrier={carrier}
        detail={state.data}
        reload={reload}
        initialChat={tripChatTab(chat)}
      />
    </>
  );
}

function TripBody({
  carrier,
  detail,
  reload,
  initialChat,
}: {
  carrier: CarrierContext;
  detail: CarrierTripDetail & {
    endEstimate: TripEndEstimate | null;
    backhaul: TripBackhaul | null;
  };
  reload: () => Promise<void>;
  initialChat: TripChatTab;
}) {
  const isOwnerOperator = useSession().profile?.isOwnerOperator === true;
  const internalHidden =
    detail.internalConversationId === null ||
    hidesInternalChat({ isOwnerOperator, staffCount: detail.staffCount });
  const [chatTab, setChatTab] = useState<TripChatTab>(initialChat);
  // A notification of the internal chat opened over this screen: its tab.
  const [requested, setRequested] = useState(initialChat);
  if (requested !== initialChat) {
    setRequested(initialChat);
    setChatTab(initialChat);
  }
  const tab: TripChatTab = internalHidden ? 'shipper' : chatTab;
  const [barHeight, setBarHeight] = useState(0);
  const { trip } = detail;
  const l = trip.load;
  const onRoad = isTripActive(trip.status);
  const cancelled = trip.status === 'cancelled';
  const assignment = useTripAssignment({
    client: carrier.client,
    tripId: trip.id,
    status: trip.status,
    loadUnitType: l.unit_type,
    loadRequirements: l.special_requirements,
    current: { vehicleId: trip.vehicleId, operatorId: trip.operatorId },
    options: detail.assignment,
    onAssigned: reload,
  });
  const action = cancelled ? null : assignment.action;
  const position = trip.lastPosition;
  const folio = tripFolio(trip.id);
  const progress = nextStep(trip.status).progress;
  const route = carrierTripsCopy.list.route(
    `${l.origin_city}, ${l.origin_state}`,
    `${l.destination_city}, ${l.destination_state}`,
  );

  return (
    <>
      <Screen belowHeader bottom={action ? barHeight : 0}>
        <TripHeading
          eyebrow={folio ? supportCopy.folio(folio) : copy.title}
          title={route}
          pill={{ label: tripStatusLabels[trip.status], tone: tripStatusTone(trip.status) }}
        />
        {l.agreed_price_cents !== null ? (
          <Money cents={l.agreed_price_cents} size="title" label={copy.agreedPrice} />
        ) : null}
        {cancelled ? (
          <Notice tone="danger">{copy.cancelled(detail.cancellationReason)}</Notice>
        ) : (
          <TripSteps
            progress={progress}
            details={stepDetails(
              progress,
              detail.events.map((e) => ({ type: e.event_type, occurredAt: e.occurred_at })),
            )}
          />
        )}
        {trip.status === 'delivered' ? <Notice tone="done">{copy.delivered}</Notice> : null}

        {onRoad ? (
          <Group>
            <TripMap
              trips={[
                {
                  key: trip.id,
                  origin: { lat: l.origin_lat, lng: l.origin_lng },
                  destination: { lat: l.destination_lat, lng: l.destination_lng },
                  trail: detail.trail,
                  position,
                },
              ]}
            />
            <Cell>
              <PositionLine trip={trip} />
            </Cell>
            {position ? (
              <Cell
                icon="locate"
                title={carrierTripsCopy.monitor.openPosition}
                onPress={() => void Linking.openURL(mapPointUrl(position))}
              />
            ) : null}
          </Group>
        ) : null}

        {detail.backhaul ? (
          <BackhaulSection backhaul={detail.backhaul} city={l.destination_city} />
        ) : null}

        <SectionHeader title={copy.route} />
        <Group>
          <DetailRow
            label={copy.pickupWindow}
            value={copy.window(
              formatDateTime(l.pickup_window_start),
              formatDateTime(l.pickup_window_end),
            )}
          />
          <DetailRow
            label={copy.deliveryWindow}
            value={copy.window(
              formatDateTime(l.delivery_window_start),
              formatDateTime(l.delivery_window_end),
            )}
          />
          <DetailRow
            label={copy.cargo}
            value={`${cargoTypeLabels[l.cargo_type]} · ${l.description}`}
          />
          <TripEndRow estimate={detail.endEstimate} />
        </Group>

        {cancelled ? null : assignment.section}
        {trip.unitName && trip.operatorName ? (
          <Group>
            <TextCell icon="person">
              {carrierTripsCopy.assign.current(trip.unitName, trip.operatorName)}
            </TextCell>
          </Group>
        ) : null}
        {/* H2: the hombre-camión alone would send it to himself (D13-E1). */}
        {trip.operatorName &&
        !hidesInternalChat({ isOwnerOperator, staffCount: detail.staffCount }) &&
        canSendTripLink({ status: trip.status, operatorId: trip.operatorId }) ? (
          <TripLinkSection
            client={carrier.client}
            tripId={trip.id}
            operatorName={trip.operatorName}
            route={route}
          />
        ) : null}

        {detail.cargoInsurance ? <CargoInsuranceSection state={detail.cargoInsurance} /> : null}

        <TripDocumentsSection
          client={carrier.client}
          tripId={trip.id}
          status={trip.status}
          documents={detail.documents}
          checklist={detail.checklist}
          uploadableKinds={detail.uploadableKinds}
          cargoInsurance={detail.cargoInsurance}
          onChanged={reload}
        />

        <SharedDocumentsSection
          client={carrier.client}
          rows={detail.sharedDocuments}
          provider={detail.provider}
          canRevoke={carrier.isManager}
          onChanged={reload}
        />

        <TimelineSection
          entries={detail.events.map((e) => ({
            key: e.id,
            type: e.event_type,
            occurredAt: e.occurred_at,
            pending: false,
          }))}
        />

        <SectionHeader title={copy.evidence} />
        <Group>
          <TextCell icon="camera">
            {copy.evidenceCount(detail.evidence.pickup, detail.evidence.delivery)}
          </TextCell>
        </Group>

        <SectionHeader title={copy.incidents} />
        <IncidentList incidents={detail.incidents} />

        <SectionHeader title={copy.chat} />
        {internalHidden ? null : (
          <Segmented
            label={internalChatCopy.tabs.label}
            value={tab}
            options={[
              { value: 'shipper', label: internalChatCopy.tabs.shipper },
              { value: 'internal', label: internalChatCopy.tabs.internal },
            ]}
            onChange={setChatTab}
          />
        )}
        {tab === 'internal' && detail.internalConversationId ? (
          <ChatPanel
            key="internal"
            client={carrier.client}
            conversationId={detail.internalConversationId}
            internal
            description={internalChatCopy.staffDescription}
          />
        ) : detail.conversationId ? (
          <ChatPanel key="shipper" client={carrier.client} conversationId={detail.conversationId} />
        ) : (
          <Group>
            <TextCell tone="dim">{copy.chatUnavailable}</TextCell>
          </Group>
        )}

        {canCancelTrip(trip.status) ? (
          <TripCancelSection
            client={carrier.client}
            tripId={trip.id}
            status={trip.status}
            hasUnit={trip.vehicleId !== null}
            onCancelled={reload}
          />
        ) : null}

        {/* "Ayuda" with this trip's folio (I2). */}
        <HelpCell tripId={trip.id} />
      </Screen>
      {action ? <KeyboardBottomBar action={action} onHeight={setBarHeight} /> : null}
    </>
  );
}

/** "Para el regreso" (I7): the best return loads of the unit near the destination. */
function BackhaulSection({ backhaul, city }: { backhaul: TripBackhaul; city: string }) {
  return (
    <>
      <SectionHeader title={backhaulCopy.section} />
      <Group>
        {backhaul.suggestions.length === 0 ? (
          <TextCell tone="dim">{backhaulCopy.empty}</TextCell>
        ) : (
          backhaul.suggestions.map((r, i) => (
            <RecommendationCell key={r.loadId} recommendation={r} rank={i + 1} />
          ))
        )}
      </Group>
      <Footnote>
        {backhaulCopy.description(
          city,
          backhaul.availableFrom ? formatDateTime(backhaul.availableFrom) : null,
        )}
      </Footnote>
    </>
  );
}

/** "Fin estimado de descarga" (H5): the time and what it is based on; nothing once unloaded. */
function TripEndRow({ estimate }: { estimate: TripEndEstimate | null }) {
  if (!estimate || estimate.source === 'finished') return null;
  const basis = dwellCopy.tripEndBasis(estimate);
  const at = formatDateTime(estimate.endsAt);
  return <DetailRow label={dwellCopy.tripEnd} value={basis ? `${at} · ${basis}` : at} />;
}
