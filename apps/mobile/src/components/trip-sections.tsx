import {
  formatDateTime,
  incidentKindLabels,
  incidentStatusLabels,
  incidentStatusTone,
  operatorEvidenceCopy,
  operatorTripCopy as copy,
  tripEventTypeLabels,
  type IncidentKind,
  type TripEventType,
} from '@transport/shared';
import { StyleSheet, Text, View } from 'react-native';

import type { IncidentRow } from '../lib/trip-api';
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

function useSectionStyles() {
  return STYLES[useTheme().theme];
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
            pill={entry.pending ? { label: copy.pendingTag, tone: 'pending' } : undefined}
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
            pill={
              incident.pending
                ? { label: copy.incidentPendingTag, tone: 'pending' }
                : { label: incidentStatusLabels.open, tone: incidentStatusTone('open') }
            }
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
              tone: incidentStatusTone(incident.status),
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

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    section: { gap: spacing.sm + spacing.xs },
    grow: { flex: 1 },
    headline: type.headline,
    body: type.body,
    dim: { ...type.subhead, color: colors.textDim },
    footnote: { ...type.footnote, ...type.num },
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
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
