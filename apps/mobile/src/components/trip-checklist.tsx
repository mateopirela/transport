import {
  formatDateTime,
  groupTripChecklist,
  isTripDocumentCode,
  TRIP_DOCUMENT_KINDS,
  tripChecklistCopy as copy,
  tripChecklistPending,
  tripDocumentKindLabels,
  type TripChecklistRow,
} from '@transport/shared';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';
import { Badge } from './fleet-ui';

/** Label of a checklist row: a document kind or one of the operator's items. */
export function checklistItemLabel(code: string): string {
  if (isTripDocumentCode(code, TRIP_DOCUMENT_KINDS)) return tripDocumentKindLabels[code];
  return copy.items[code] ?? code;
}

function stageLabel(stage: string): string {
  return (copy.stages as Record<string, string>)[stage] ?? copy.unknownStage(stage);
}

function responsibleLabel(responsible: string): string {
  return (copy.responsible as Record<string, string>)[responsible] ?? responsible;
}

/**
 * The checklist of a trip (D22) by stage: each document, the photos and the
 * signed delivery, with who does it and whether it is done. Read-only; the
 * uploads live next to it.
 */
export function TripChecklist({ rows }: { rows: readonly TripChecklistRow[] }) {
  const groups = groupTripChecklist(rows);
  const pending = tripChecklistPending(rows);
  return (
    <View style={styles.list}>
      <Badge label={copy.pendingCount(pending)} tone={pending === 0 ? 'success' : 'warning'} />
      {groups.map((group) => (
        <View key={group.stage} style={styles.group}>
          <Text style={styles.stage}>{stageLabel(group.stage)}</Text>
          {group.rows.map((row) => (
            <View
              key={row.code}
              style={styles.row}
              accessibilityLabel={checklistItemLabel(row.code)}
            >
              <View style={styles.flex}>
                <Text style={styles.item}>{checklistItemLabel(row.code)}</Text>
                <Text style={styles.meta}>
                  {responsibleLabel(row.responsible)} ·{' '}
                  {row.required ? copy.required : copy.optional}
                </Text>
              </View>
              <Text style={row.done_at ? styles.done : styles.pending}>
                {row.done_at ? copy.done(formatDateTime(row.done_at)) : copy.pending}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  group: { gap: spacing.xs },
  stage: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  flex: { flex: 1 },
  item: { fontSize: 15, color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  done: { fontSize: 12, color: colors.success, textAlign: 'right' },
  pending: { fontSize: 12, color: colors.warning, textAlign: 'right' },
});
