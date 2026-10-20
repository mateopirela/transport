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
  type IncidentKind,
  type TripEventType,
  type TripStatus,
} from '@transport/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { IncidentRow, OperatorTrip, TripLoad } from '../lib/trip-api';
import { lookOf, shape, spacing, useTheme, type Look } from '../theme';
import {
  Button,
  Cell,
  Group,
  groupInset,
  Pill,
  SectionHeader,
  TextCell,
  type PillTone,
} from './ui';

const weightFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

function openDirections(lat: number, lng: number) {
  // Opens Google Maps (app or web) or the system's handler: no API key needed.
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
}

function useSectionStyles() {
  return STYLES[useTheme().theme];
}

/** One stop of the route: the place, its address and its window. */
function StopRow({ title, address, window }: { title: string; address: string; window: string }) {
  const styles = useSectionStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.headline}>{title}</Text>
      <Text style={styles.dim}>{address}</Text>
      <Text style={styles.footnote}>{window}</Text>
    </View>
  );
}

/** Origin and destination with their windows, and directions to the next stop. */
export function RouteSection({ load, status }: { load: TripLoad; status: TripStatus }) {
  const loaded = ['in_transit', 'at_delivery', 'unloading', 'delivered'].includes(status);
  const stop = loaded
    ? { lat: load.destination_lat, lng: load.destination_lng, city: load.destination_city }
    : { lat: load.origin_lat, lng: load.origin_lng, city: load.origin_city };
  return (
    <Group>
      <StopRow
        title={`${copy.origin}: ${load.origin_city}, ${load.origin_state}`}
        address={load.origin_address}
        window={copy.pickupWindow(
          formatDateTime(load.pickup_window_start),
          formatDateTime(load.pickup_window_end),
        )}
      />
      <StopRow
        title={`${copy.destination}: ${load.destination_city}, ${load.destination_state}`}
        address={load.destination_address}
        window={copy.deliveryWindow(
          formatDateTime(load.delivery_window_start),
          formatDateTime(load.delivery_window_end),
        )}
      />
      {status === 'delivered' ? null : (
        <Cell
          icon="navigate"
          role="link"
          title={copy.directionsTo(stop.city)}
          onPress={() => openDirections(stop.lat, stop.lng)}
        />
      )}
    </Group>
  );
}

/** What is carried and the shipper's instructions. */
export function InstructionsSection({ trip }: { trip: OperatorTrip }) {
  const styles = useSectionStyles();
  const { load } = trip;
  const requirements = load.special_requirements.map((r) => specialRequirementLabels[r]);
  return (
    <View style={styles.section}>
      <SectionHeader title={copy.instructions} />
      <Group>
        <Cell strong title={cargoTypeLabels[load.cargo_type]} subtitle={load.description} />
        <Cell title={copy.weight(weightFormat.format(load.weight_kg))} />
        {requirements.length > 0 ? (
          <Cell title={copy.requirements(requirements.join(', '))} lines={3} />
        ) : null}
        {trip.vehiclePlate ? <Cell title={copy.unit(trip.vehiclePlate)} /> : null}
        {load.notes ? <TextCell tone="dim">{copy.notes(load.notes)}</TextCell> : null}
      </Group>
    </View>
  );
}

type StepState = 'done' | 'current' | 'later';

/**
 * The seven status steps on a rail (§1.7): 8 px dots joined by a hairline,
 * the done ones in ink, the current one in the accent, the coming ones
 * hollow. "Avance del viaje" heads it (the E2E flows start from it).
 */
export function ProgressSection({ status }: { status: TripStatus }) {
  const styles = useSectionStyles();
  const doneUpTo = OPERATOR_TRIP_STEPS.findIndex((e) => OPERATOR_TRIP_EVENTS[e].from === status);
  // No step starts at this status: either all done (delivered) or none.
  const done =
    doneUpTo === -1 ? (status === 'delivered' ? OPERATOR_TRIP_STEPS.length : 0) : doneUpTo;
  return (
    <View style={styles.section}>
      <SectionHeader title={copy.progress} />
      <Group>
        <View style={styles.rail}>
          {OPERATOR_TRIP_STEPS.map((event, index) => {
            const state: StepState = index < done ? 'done' : index === done ? 'current' : 'later';
            const first = index === 0;
            const last = index === OPERATOR_TRIP_STEPS.length - 1;
            return (
              <View
                key={event}
                accessibilityState={{ selected: state === 'current' }}
                style={styles.step}
              >
                <View style={styles.track}>
                  <View style={[styles.line, first ? styles.lineHidden : null]} />
                  <View
                    style={[
                      styles.dot,
                      state === 'done' ? styles.dotDone : null,
                      state === 'current' ? styles.dotCurrent : null,
                    ]}
                  />
                  <View style={[styles.line, last ? styles.lineHidden : null]} />
                </View>
                <Text
                  style={[
                    state === 'current' ? styles.headline : styles.body,
                    state === 'later' ? styles.later : null,
                  ]}
                >
                  {tripEventTypeLabels[event]}
                </Text>
              </View>
            );
          })}
        </View>
      </Group>
    </View>
  );
}

export interface TimelineEntry {
  key: string;
  type: TripEventType;
  occurredAt: string;
  pending: boolean;
}

/** Recorded events and the ones still in the phone's queue: one row each, the moment under it. */
export function TimelineSection({ entries }: { entries: readonly TimelineEntry[] }) {
  const styles = useSectionStyles();
  return (
    <View style={styles.section}>
      <SectionHeader title={copy.timeline} />
      <Group>
        {entries.length === 0 ? <TextCell tone="dim">{copy.timelineEmpty}</TextCell> : null}
        {entries.map((entry) => (
          <Cell
            key={entry.key}
            title={tripEventTypeLabels[entry.type]}
            subtitle={formatDateTime(entry.occurredAt)}
            pill={entry.pending ? { label: copy.pendingTag, tone: 'amber' } : undefined}
          />
        ))}
      </Group>
    </View>
  );
}

/** An incident reported on the phone that the loaded trip does not show yet (F7). */
export interface QueuedIncident {
  /** The key of its report (client_event_id). */
  key: string;
  kind: IncidentKind;
  description: string;
  occurredAt: string;
  /** Still on the phone (true) or sent but not loaded yet (false). */
  pending: boolean;
}

/** Which incident a photo goes to: by id, or by the key of its report while it has none. */
export type IncidentPhotoTarget =
  { incidentId: string; incidentKey: null } | { incidentId: null; incidentKey: string };

/** One incident as a row: its kind and state, what happened, when, and its photos. */
function IncidentRowView({
  kind,
  description,
  occurredAt,
  pill,
  photos,
  onAddPhoto,
  busy,
}: {
  kind: IncidentKind;
  description: string;
  occurredAt: string;
  pill: { label: string; tone: PillTone };
  photos: number | null;
  onAddPhoto: (() => void) | null;
  busy: boolean;
}) {
  const styles = useSectionStyles();
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.headline, styles.grow]}>{incidentKindLabels[kind]}</Text>
        <Pill label={pill.label} tone={pill.tone} />
      </View>
      <Text style={styles.body}>{description}</Text>
      <Text style={styles.footnote}>{formatDateTime(occurredAt)}</Text>
      {photos !== null || onAddPhoto ? (
        <View style={styles.rowFoot}>
          {photos !== null ? (
            <Text style={[styles.dim, styles.grow]}>
              {operatorEvidenceCopy.incidentPhotos(photos)}
            </Text>
          ) : (
            <View style={styles.grow} />
          )}
          {onAddPhoto ? (
            <Button
              label={operatorEvidenceCopy.takeIncident}
              icon="camera"
              variant="secondary"
              size="small"
              disabled={busy}
              onPress={onAddPhoto}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Incidents of the trip in one group, the ones still on the phone first.
 * With `onAddPhoto`, open incidents take photos from the camera (B23), also
 * before their report is sent (F7); `photoCount` says how many each one has.
 */
export function IncidentList({
  incidents,
  queued = [],
  photoCount,
  onAddPhoto,
  busy = false,
}: {
  incidents: readonly IncidentRow[];
  queued?: readonly QueuedIncident[];
  photoCount?: (target: IncidentPhotoTarget) => number;
  onAddPhoto?: (target: IncidentPhotoTarget) => void;
  busy?: boolean;
}) {
  if (incidents.length === 0 && queued.length === 0) {
    return (
      <Group>
        <TextCell tone="dim">{copy.noIncidents}</TextCell>
      </Group>
    );
  }
  return (
    <Group inset={groupInset.text}>
      {queued.map((incident) => {
        const target: IncidentPhotoTarget = { incidentId: null, incidentKey: incident.key };
        return (
          <IncidentRowView
            key={incident.key}
            kind={incident.kind}
            description={incident.description}
            occurredAt={incident.occurredAt}
            pill={{
              label: incident.pending ? copy.incidentPendingTag : incidentStatusLabels.open,
              tone: 'amber',
            }}
            photos={photoCount ? photoCount(target) : null}
            onAddPhoto={onAddPhoto ? () => onAddPhoto(target) : null}
            busy={busy}
          />
        );
      })}
      {incidents.map((incident) => {
        const target: IncidentPhotoTarget = { incidentId: incident.id, incidentKey: null };
        return (
          <IncidentRowView
            key={incident.id}
            kind={incident.kind}
            description={incident.description}
            occurredAt={incident.occurred_at}
            pill={{
              label: incidentStatusLabels[incident.status],
              tone: incident.status === 'open' ? 'amber' : 'ok',
            }}
            photos={photoCount ? photoCount(target) : null}
            onAddPhoto={onAddPhoto && incident.status === 'open' ? () => onAddPhoto(target) : null}
            busy={busy}
          />
        );
      })}
    </Group>
  );
}

/** The dot of a step and the hairline that joins it to its neighbours. */
const DOT = spacing.sm;

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    section: { gap: spacing.sm + spacing.xs },
    grow: { flex: 1 },
    headline: type.headline,
    body: type.body,
    dim: { ...type.subhead, color: colors.textDim },
    footnote: { ...type.footnote, ...type.num },
    later: { color: colors.textDim },
    row: {
      gap: spacing.xs / 2,
      minHeight: shape.cellMinHeight,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
    },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    rail: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + spacing.xs,
      minHeight: spacing.xl,
    },
    track: { width: DOT, alignSelf: 'stretch', alignItems: 'center' },
    line: { flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.separator },
    lineHidden: { backgroundColor: 'transparent' },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: colors.textFaint,
      backgroundColor: colors.cell,
    },
    dotDone: { backgroundColor: colors.text, borderColor: colors.text },
    dotCurrent: { backgroundColor: colors.accent, borderColor: colors.accent },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
