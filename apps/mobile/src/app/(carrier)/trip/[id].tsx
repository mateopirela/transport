import {
  canCancelTrip,
  cargoTypeLabels,
  carrierTripsCopy,
  formatDateTime,
  formatMxn,
  hidesInternalChat,
  internalChatCopy,
  isTripActive,
  mapPointUrl,
  tripChatTab,
  tripStatusLabels,
  type TripChatTab,
} from '@transport/shared';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { KeyboardBottomBar } from '../../../components/keyboard-bar';
import { ChatPanel } from '../../../components/chat-panel';
import { DetailRow } from '../../../components/detail-row';
import { SharedDocumentsSection } from '../../../components/shared-documents-section';
import { useTripAssignment } from '../../../components/trip-assign-form';
import { TripCancelSection } from '../../../components/trip-cancel-section';
import { TripDocumentsSection } from '../../../components/trip-documents-section';
import { TripMap } from '../../../components/trip-map';
import { PositionLine, tripStatusTone } from '../../../components/trip-position';
import { IncidentList, TimelineSection } from '../../../components/trip-sections';
import {
  Cell,
  Group,
  LoadError,
  Notice,
  Pill,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
  TextCell,
  ValueRow,
} from '../../../components/ui';
import { loadCarrierTrip, type CarrierTripDetail } from '../../../lib/carrier-trips-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { usePolling } from '../../../lib/use-polling';
import { useSession } from '../../../providers/session';
import { spacing, useTheme } from '../../../theme';

const copy = carrierTripsCopy.detail;

/**
 * A won trip for the carrier (B20): status, route and the map while it is on
 * the road, "Asignar operador" in the bottom bar until the operator departs,
 * the documents, what is shared with the shipper and its provider status
 * (G6), the timeline, incidents, evidence, the trip chat ("Cliente" and the
 * internal one with the operator, "Interno": H1; `?chat=interno` opens it)
 * and the cancellation with a reason (G5).
 */
export default function CarrierTripScreen() {
  const { id, chat } = useLocalSearchParams<{ id: string; chat?: string }>();
  const load = useCallback(
    ({ client, companyId, isManager }: CarrierContext) =>
      loadCarrierTrip(client, companyId, id, isManager),
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
  detail: CarrierTripDetail;
  reload: () => Promise<void>;
  initialChat: TripChatTab;
}) {
  const { type } = useTheme();
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

  return (
    <>
      <Screen belowHeader bottom={action ? barHeight : 0}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={type.title2}>
            {carrierTripsCopy.list.route(
              `${l.origin_city}, ${l.origin_state}`,
              `${l.destination_city}, ${l.destination_state}`,
            )}
          </Text>
          <Pill label={tripStatusLabels[trip.status]} tone={tripStatusTone(trip.status)} />
        </View>
        {cancelled ? (
          <Notice tone="danger">{copy.cancelled(detail.cancellationReason)}</Notice>
        ) : null}
        {trip.status === 'delivered' ? <Notice tone="info">{copy.delivered}</Notice> : null}

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
          {l.agreed_price_cents !== null ? (
            <ValueRow label={copy.agreedPrice} value={formatMxn(l.agreed_price_cents)} strong />
          ) : null}
          {trip.estimatedUnloadEndAt ? (
            <ValueRow
              label={copy.unloadEstimate}
              value={formatDateTime(trip.estimatedUnloadEndAt)}
            />
          ) : null}
        </Group>

        {cancelled ? null : assignment.section}
        {trip.unitName && trip.operatorName ? (
          <Group>
            <TextCell icon="person">
              {carrierTripsCopy.assign.current(trip.unitName, trip.operatorName)}
            </TextCell>
          </Group>
        ) : null}

        <TripDocumentsSection
          client={carrier.client}
          tripId={trip.id}
          status={trip.status}
          documents={detail.documents}
          checklist={detail.checklist}
          uploadableKinds={detail.uploadableKinds}
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
      </Screen>
      {action ? <KeyboardBottomBar action={action} onHeight={setBarHeight} /> : null}
    </>
  );
}

const styles = StyleSheet.create({ head: { gap: spacing.sm, alignItems: 'flex-start' } });
