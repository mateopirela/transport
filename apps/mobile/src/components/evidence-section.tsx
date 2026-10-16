import {
  formatDateTime,
  missingPhotos,
  operatorEvidenceCopy as copy,
  receiverFormSchema,
  type GatedEvidenceStage,
} from '@transport/shared';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { validateForm, type FieldErrors } from '../lib/forms';
import { colors, spacing } from '../theme';
import { Badge, SectionTitle } from './fleet-ui';
import { Body, Button, Field } from './ui';

/** A photo of a stage: on the server, or still on the phone (with its thumbnail). */
export interface EvidenceItem {
  key: string;
  capturedAt: string;
  uri: string | null;
  pending: boolean;
}

/** Photos of a stage, how many the minimum asks for, and the camera button (B23). */
export function EvidenceSection({
  stage,
  minimum,
  items,
  busy,
  disabled,
  onCapture,
}: {
  stage: GatedEvidenceStage;
  minimum: number;
  items: readonly EvidenceItem[];
  busy: boolean;
  disabled: boolean;
  onCapture: () => void;
}) {
  const missing = missingPhotos(minimum, items.length);
  return (
    <View style={styles.section}>
      <SectionTitle>{copy.title[stage]}</SectionTitle>
      <Body>{copy.help[stage]}</Body>
      <Badge
        label={copy.progress(items.length, minimum)}
        tone={missing > 0 ? 'warning' : 'success'}
      />
      {items.length > 0 ? (
        <View style={styles.grid}>
          {items.map((item) => (
            <View key={item.key} style={styles.tile}>
              {item.uri ? (
                <Image
                  source={{ uri: item.uri }}
                  style={styles.thumb}
                  accessibilityLabel={copy.takenAt(formatDateTime(item.capturedAt))}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <Text style={styles.meta}>{formatDateTime(item.capturedAt)}</Text>
              <Badge
                label={item.pending ? copy.pendingTag : copy.uploadedTag}
                tone={item.pending ? 'warning' : 'success'}
              />
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.meta}>{copy.cameraOnly}</Text>
      <Button
        label={copy.take}
        variant="secondary"
        onPress={onCapture}
        loading={busy}
        disabled={disabled}
      />
    </View>
  );
}

/** Name of whoever receives the cargo, then the step that finishes unloading. */
export function ReceiverForm({
  submitLabel,
  busy,
  disabled,
  onSubmit,
}: {
  submitLabel: string;
  busy: boolean;
  disabled: boolean;
  onSubmit: (receivedBy: string) => void;
}) {
  const [receivedBy, setReceivedBy] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  function submit() {
    const parsed = validateForm(receiverFormSchema, { receivedBy });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    onSubmit(parsed.data.receivedBy);
  }

  return (
    <View style={styles.section}>
      <SectionTitle>{copy.receiverTitle}</SectionTitle>
      <Body>{copy.receiverHelp}</Body>
      <Field
        label={copy.receiverName}
        value={receivedBy}
        onChangeText={setReceivedBy}
        error={errors.receivedBy}
        autoCapitalize="words"
        autoComplete="off"
        maxLength={200}
      />
      <Button label={submitLabel} onPress={submit} loading={busy} disabled={disabled || busy} />
    </View>
  );
}

const TILE = 96;

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: TILE, gap: spacing.xs },
  thumb: { width: TILE, height: TILE, borderRadius: 8, backgroundColor: colors.border },
  thumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  meta: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
});
