import {
  formatDateTime,
  missingPhotos,
  operatorEvidenceCopy as copy,
  receiverFormSchema,
  type GatedEvidenceStage,
} from '@transport/shared';
import { useImperativeHandle, useState, type Ref } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { validateForm, type FieldErrors } from '../lib/forms';
import { iconSize, lookOf, shape, spacing, useTheme, type Look } from '../theme';
import { Icon } from './icons';
import type { FormHandle } from './trip-forms';
import { Button, FieldCell, Footnote, Group, Pill, SectionHeader, TextCell } from './ui';

/** A photo of a stage: on the server, or still on the phone (with its thumbnail). */
export interface EvidenceItem {
  key: string;
  capturedAt: string;
  uri: string | null;
  pending: boolean;
}

/** Photos in a row of the grid. */
const COLUMNS = 3;

/**
 * Photos of a stage (B23): what to photograph, how many the minimum asks for
 * as a pill, the photos in a grid of three (one still on the phone carries an
 * amber "Por subir"), and the camera button.
 */
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
  const { theme, colors } = useTheme();
  const styles = STYLES[theme];
  const [width, setWidth] = useState(0);
  const missing = missingPhotos(minimum, items.length);
  const tile = width > 0 ? (width - spacing.sm * (COLUMNS - 1)) / COLUMNS : 0;
  return (
    <View style={styles.section}>
      <SectionHeader title={copy.title[stage]} />
      <Pill label={copy.progress(items.length, minimum)} tone={missing > 0 ? 'amber' : 'ok'} />
      <Group>
        <TextCell tone="dim">{copy.help[stage]}</TextCell>
        {items.length > 0 ? (
          <View style={styles.gridCell}>
            <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              {tile > 0
                ? items.map((item) => (
                    <View key={item.key} style={[styles.tile, { width: tile }]}>
                      {item.uri ? (
                        <Image
                          source={{ uri: item.uri }}
                          style={[styles.thumb, { height: tile }]}
                          accessibilityLabel={copy.takenAt(formatDateTime(item.capturedAt))}
                        />
                      ) : (
                        <View
                          accessible
                          accessibilityLabel={copy.takenAt(formatDateTime(item.capturedAt))}
                          style={[styles.thumb, styles.thumbEmpty, { height: tile }]}
                        >
                          <Icon name="image" size={iconSize.regular} color={colors.textFaint} />
                        </View>
                      )}
                      <Text style={styles.caption} numberOfLines={1}>
                        {formatDateTime(item.capturedAt)}
                      </Text>
                      {item.pending ? <Pill label={copy.pendingTag} tone="amber" /> : null}
                    </View>
                  ))
                : null}
            </View>
          </View>
        ) : null}
      </Group>
      <Button
        label={copy.take}
        icon="camera"
        variant="secondary"
        onPress={onCapture}
        loading={busy}
        disabled={disabled}
      />
      <Footnote>{copy.cameraOnly}</Footnote>
    </View>
  );
}

/**
 * "Quién recibe": the name of whoever receives the cargo at the destination.
 * The screen sends it through `ref` ("Terminar descarga" in its bottom bar):
 * `submit` returns the name once it is valid.
 */
export function ReceiverFields({ ref }: { ref?: Ref<FormHandle<string>> }) {
  const styles = STYLES[useTheme().theme];
  const [receivedBy, setReceivedBy] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  useImperativeHandle(ref, () => ({
    submit: () => {
      const parsed = validateForm(receiverFormSchema, { receivedBy });
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return null;
      }
      setErrors({});
      return parsed.data.receivedBy;
    },
  }));

  return (
    <View style={styles.section}>
      <SectionHeader title={copy.receiverTitle} />
      <Group>
        <FieldCell
          label={copy.receiverName}
          value={receivedBy}
          onChangeText={setReceivedBy}
          error={errors.receivedBy}
          autoCapitalize="words"
          autoComplete="off"
          maxLength={200}
        />
      </Group>
      <Footnote>{copy.receiverHelp}</Footnote>
    </View>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    section: { gap: spacing.sm + spacing.xs },
    gridCell: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tile: { gap: spacing.xs },
    thumb: { width: '100%', borderRadius: shape.photo, backgroundColor: colors.surfaceHigh },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
    caption: { ...type.caption, ...type.num },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
