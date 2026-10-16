import Ionicons from '@expo/vector-icons/Ionicons';
import {
  cargoTypeLabels,
  formatDateTime,
  incidentKindLabels,
  incidentStatusLabels,
  OPERATOR_TRIP_EVENTS,
  OPERATOR_TRIP_STEPS,
  operatorEvidenceCopy,
  operatorTripCopy as copy,
  specialRequirementLabels,
  tripEventTypeLabels,
  type TripEventType,
  type TripStatus,
} from '@transport/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { IncidentRow, OperatorTrip, TripLoad } from '../lib/trip-api';
import { colors, spacing } from '../theme';
import { Badge, Card, SectionTitle } from './fleet-ui';
import { Body, Button } from './ui';

const weightFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

function openDirections(lat: number, lng: number) {
  // Opens Google Maps (app or web) or the system's handler: no API key needed.
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
}

/** Origin and destination with their windows, and directions to the next stop. */
export function RouteSection({ load, status }: { load: TripLoad; status: TripStatus }) {
  const loaded = ['in_transit', 'at_delivery', 'unloading', 'delivered'].includes(status);
  const stop = loaded
    ? { lat: load.destination_lat, lng: load.destination_lng, city: load.destination_city }
    : { lat: load.origin_lat, lng: load.origin_lng, city: load.origin_city };
  return (
    <View style={styles.section}>
      <Card
        title={`${copy.origin}: ${load.origin_city}, ${load.origin_state}`}
        subtitle={load.origin_address}
      >
        <Text style={styles.meta}>
          {copy.pickupWindow(
            formatDateTime(load.pickup_window_start),
            formatDateTime(load.pickup_window_end),
          )}
        </Text>
      </Card>
      <Card
        title={`${copy.destination}: ${load.destination_city}, ${load.destination_state}`}
        subtitle={load.destination_address}
      >
        <Text style={styles.meta}>
          {copy.deliveryWindow(
            formatDateTime(load.delivery_window_start),
            formatDateTime(load.delivery_window_end),
          )}
        </Text>
      </Card>
      {status === 'delivered' ? null : (
        <Button
          label={copy.directionsTo(stop.city)}
          variant="secondary"
          onPress={() => openDirections(stop.lat, stop.lng)}
        />
      )}
    </View>
  );
}

/** What is carried and the shipper's instructions. */
export function InstructionsSection({ trip }: { trip: OperatorTrip }) {
  const { load } = trip;
  const requirements = load.special_requirements.map((r) => specialRequirementLabels[r]);
  return (
    <View style={styles.section}>
      <SectionTitle>{copy.instructions}</SectionTitle>
      <Card title={cargoTypeLabels[load.cargo_type]} subtitle={load.description}>
        <Text style={styles.meta}>{copy.weight(weightFormat.format(load.weight_kg))}</Text>
        {requirements.length > 0 ? (
          <Text style={styles.meta}>{copy.requirements(requirements.join(', '))}</Text>
        ) : null}
        {trip.vehiclePlate ? <Text style={styles.meta}>{copy.unit(trip.vehiclePlate)}</Text> : null}
      </Card>
      {load.notes ? <Body>{copy.notes(load.notes)}</Body> : null}
    </View>
  );
}

/** The seven status steps, done or pending, in order. */
export function ProgressSection({ status }: { status: TripStatus }) {
  const doneUpTo = OPERATOR_TRIP_STEPS.findIndex((e) => OPERATOR_TRIP_EVENTS[e].from === status);
  // No step starts at this status: either all done (delivered) or none.
  const done =
    doneUpTo === -1 ? (status === 'delivered' ? OPERATOR_TRIP_STEPS.length : 0) : doneUpTo;
  return (
    <View style={styles.section}>
      <SectionTitle>{copy.progress}</SectionTitle>
      {OPERATOR_TRIP_STEPS.map((event, index) => {
        const state = index < done ? 'done' : index === done ? 'next' : 'later';
        return (
          <View key={event} style={styles.step}>
            <Ionicons
              name={state === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={
                state === 'done' ? colors.success : state === 'next' ? colors.accent : colors.border
              }
            />
            <Text style={[styles.stepText, state === 'next' ? styles.stepNext : null]}>
              {tripEventTypeLabels[event]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export interface TimelineEntry {
  key: string;
  type: TripEventType;
  occurredAt: string;
  pending: boolean;
}

/** Recorded events and the ones still in the phone's queue. */
export function TimelineSection({ entries }: { entries: readonly TimelineEntry[] }) {
  return (
    <View style={styles.section}>
      <SectionTitle>{copy.timeline}</SectionTitle>
      {entries.length === 0 ? <Body>{copy.timelineEmpty}</Body> : null}
      {entries.map((entry) => (
        <View key={entry.key} style={styles.timelineRow}>
          <View style={styles.flex}>
            <Text style={styles.stepText}>{tripEventTypeLabels[entry.type]}</Text>
            <Text style={styles.meta}>{formatDateTime(entry.occurredAt)}</Text>
          </View>
          {entry.pending ? <Badge label={copy.pendingTag} tone="warning" /> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Incidents of the trip. With `onAddPhoto`, open incidents take photos from
 * the camera (B23); `photoCount` says how many each one has.
 */
export function IncidentList({
  incidents,
  photoCount,
  onAddPhoto,
  busy = false,
}: {
  incidents: readonly IncidentRow[];
  photoCount?: (incidentId: string) => number;
  onAddPhoto?: (incidentId: string) => void;
  busy?: boolean;
}) {
  if (incidents.length === 0) return <Body>{copy.noIncidents}</Body>;
  return (
    <>
      {incidents.map((incident) => (
        <Card
          key={incident.id}
          title={incidentKindLabels[incident.kind]}
          subtitle={formatDateTime(incident.occurred_at)}
        >
          <Text style={styles.meta}>{incident.description}</Text>
          <Badge
            label={incidentStatusLabels[incident.status]}
            tone={incident.status === 'open' ? 'warning' : 'success'}
          />
          {photoCount ? (
            <Text style={styles.meta}>
              {operatorEvidenceCopy.incidentPhotos(photoCount(incident.id))}
            </Text>
          ) : null}
          {onAddPhoto && incident.status === 'open' ? (
            <Button
              label={operatorEvidenceCopy.takeIncident}
              variant="secondary"
              disabled={busy}
              onPress={() => onAddPhoto(incident.id)}
            />
          ) : null}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  meta: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepText: { fontSize: 15, color: colors.text },
  stepNext: { fontWeight: '700', color: colors.accent },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
