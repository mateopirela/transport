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
import { Fragment } from 'react';
import { StyleSheet, Text } from 'react-native';

import { lookOf, useTheme, type Look } from '../theme';
import { Cell, Group, GroupLabel, Pill } from './ui';

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
 * The checklist of a trip (D22) by stage, a group each: each document, the
 * photos and the signed delivery, with who does it and whether it is done.
 * Read-only; the uploads live next to it.
 */
export function TripChecklist({ rows }: { rows: readonly TripChecklistRow[] }) {
  const styles = STYLES[useTheme().theme];
  const groups = groupTripChecklist(rows);
  const pending = tripChecklistPending(rows);
  return (
    <>
      <Pill label={copy.pendingCount(pending)} tone={pending === 0 ? 'ok' : 'amber'} />
      {groups.map((group) => (
        <Fragment key={group.stage}>
          <GroupLabel>{stageLabel(group.stage)}</GroupLabel>
          <Group>
            {group.rows.map((row) => (
              <Cell key={row.code}>
                <Text style={styles.item}>{checklistItemLabel(row.code)}</Text>
                <Text style={styles.meta}>
                  {responsibleLabel(row.responsible)} ·{' '}
                  {row.required ? copy.required : copy.optional}
                </Text>
                <Text style={row.done_at ? styles.done : styles.pending}>
                  {row.done_at ? copy.done(formatDateTime(row.done_at)) : copy.pending}
                </Text>
              </Cell>
            ))}
          </Group>
        </Fragment>
      ))}
    </>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    item: type.body,
    meta: type.footnote,
    done: { ...type.footnote, color: colors.okText },
    pending: { ...type.footnote, color: colors.amberText },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
