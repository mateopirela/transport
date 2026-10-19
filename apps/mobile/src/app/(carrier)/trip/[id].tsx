import {
  cargoTypeLabels,
  carrierTripsCopy,
  formatDateTime,
  formatMxn,
  isTripActive,
  tripStatusLabels,
} from '@transport/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatPanel } from '../../../components/chat-panel';
import { Badge, Loaded, SectionTitle } from '../../../components/fleet-ui';
import { TripAssignForm } from '../../../components/trip-assign-form';
import { TripDocumentsSection } from '../../../components/trip-documents-section';
import { TripMap } from '../../../components/trip-map';
import { PositionLine, tripStatusTone } from '../../../components/trip-position';
import { IncidentList, TimelineSection } from '../../../components/trip-sections';
import { Body, Notice, Screen } from '../../../components/ui';
import { loadCarrierTrip } from '../../../lib/carrier-trips-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { usePolling } from '../../../lib/use-polling';
import { colors } from '../../../theme';

const copy = carrierTripsCopy.detail;

/**
 * A won trip for the carrier (B20): status, route and the map while it is on
 * the road, "Asignar operador" until the operator departs, the timeline,
 * incidents, evidence and the trip chat.
 */
export default function CarrierTripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    ({ client, companyId, isManager }: CarrierContext) =>
      loadCarrierTrip(client, companyId, id, isManager),
    [id],
  );
  const { carrier, state, reload } = useCarrierData(load);
  const refresh = useCallback(() => void reload(), [reload]);
  usePolling(refresh);

  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.title }} />
      <Loaded state={state} onRetry={refresh}>
        {(detail) => {
          if (!detail || !carrier) return <Notice tone="warning">{copy.notFound}</Notice>;
          const { trip } = detail;
          const l = trip.load;
          const onRoad = isTripActive(trip.status);
          return (
            <>
              <Text accessibilityRole="header" style={styles.route}>
                {carrierTripsCopy.list.route(
                  `${l.origin_city}, ${l.origin_state}`,
                  `${l.destination_city}, ${l.destination_state}`,
                )}
              </Text>
              <Badge label={tripStatusLabels[trip.status]} tone={tripStatusTone(trip.status)} />
              {trip.status === 'cancelled' ? (
                <Notice tone="danger">{copy.cancelled(detail.cancellationReason)}</Notice>
              ) : null}
              {trip.status === 'delivered' ? <Notice tone="info">{copy.delivered}</Notice> : null}

              {onRoad ? (
                <>
                  <TripMap
                    trips={[
                      {
                        key: trip.id,
                        origin: { lat: l.origin_lat, lng: l.origin_lng },
                        destination: { lat: l.destination_lat, lng: l.destination_lng },
                        trail: detail.trail,
                        position: trip.lastPosition,
                      },
                    ]}
                  />
                  <PositionLine trip={trip} withLink />
                </>
              ) : null}

              <SectionTitle>{copy.route}</SectionTitle>
              <Row
                label={copy.pickupWindow}
                value={copy.window(
                  formatDateTime(l.pickup_window_start),
                  formatDateTime(l.pickup_window_end),
                )}
              />
              <Row
                label={copy.deliveryWindow}
                value={copy.window(
                  formatDateTime(l.delivery_window_start),
                  formatDateTime(l.delivery_window_end),
                )}
              />
              <Row
                label={copy.cargo}
                value={`${cargoTypeLabels[l.cargo_type]} · ${l.description}`}
              />
              {l.agreed_price_cents !== null ? (
                <Row label={copy.agreedPrice} value={formatMxn(l.agreed_price_cents)} />
              ) : null}
              {trip.estimatedUnloadEndAt ? (
                <Row
                  label={copy.unloadEstimate}
                  value={formatDateTime(trip.estimatedUnloadEndAt)}
                />
              ) : null}

              {trip.status === 'cancelled' ? null : (
                <TripAssignForm
                  client={carrier.client}
                  tripId={trip.id}
                  status={trip.status}
                  loadUnitType={l.unit_type}
                  current={{ vehicleId: trip.vehicleId, operatorId: trip.operatorId }}
                  options={detail.assignment}
                  onAssigned={reload}
                />
              )}
              {trip.unitName && trip.operatorName ? (
                <Body>{carrierTripsCopy.assign.current(trip.unitName, trip.operatorName)}</Body>
              ) : null}

              <TripDocumentsSection
                client={carrier.client}
                tripId={trip.id}
                status={trip.status}
                documents={detail.documents}
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

              <SectionTitle>{copy.evidence}</SectionTitle>
              <Body>{copy.evidenceCount(detail.evidence.pickup, detail.evidence.delivery)}</Body>

              <SectionTitle>{copy.incidents}</SectionTitle>
              <IncidentList incidents={detail.incidents} />

              <SectionTitle>{copy.chat}</SectionTitle>
              {detail.conversationId ? (
                <ChatPanel client={carrier.client} conversationId={detail.conversationId} />
              ) : (
                <Body>{copy.chatUnavailable}</Body>
              )}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  route: { fontSize: 20, fontWeight: '700', color: colors.navy },
  row: { gap: 2 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 15, color: colors.text, lineHeight: 21 },
});
