import { trackingCopy as copy } from '@transport/shared';
import { useRouter, useSegments } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { TripTracking } from '../lib/use-trip-tracking';
import { iconSize, lookOf, shape, spacing, useTheme, type Look } from '../theme';
import { Icon } from './icons';
import { Button, Group, Notice } from './ui';

/** "Compartiendo ubicación" indicator of the trip screen, or what is missing (B22). */
export function TrackingBanner({ tracking }: { tracking: TripTracking }) {
  const router = useRouter();
  const { theme, colors, type } = useTheme();
  const styles = STYLES[theme];
  // The hombre-camión sees the trip inside the carrier area (D13).
  const inCarrierArea = useSegments()[0] === '(carrier)';
  const { decision, unavailable, queuedPoints } = tracking;

  if (decision === 'needs_consent' || decision === 'needs_permission') {
    const consent = decision === 'needs_consent';
    return (
      <Notice tone="warning" title={consent ? copy.needsConsentTitle : copy.needsPermissionTitle}>
        <Text style={type.subhead}>
          {consent ? copy.needsConsentBody : copy.needsPermissionBody}
        </Text>
        <View style={styles.action}>
          <Button
            label={consent ? copy.needsConsentAction : copy.needsPermissionAction}
            variant="secondary"
            size="small"
            onPress={() => router.push(inCarrierArea ? '/my-trip-consent' : '/location-consent')}
          />
        </View>
      </Notice>
    );
  }
  if (decision !== 'track') return null;
  if (unavailable) return <Notice tone="warning">{copy.unavailable}</Notice>;
  return (
    <Group>
      <View
        style={styles.row}
        accessibilityRole="summary"
        accessibilityLabel={`${copy.sharingTitle}. ${copy.sharingBody}`}
      >
        <Icon name="locate" size={iconSize.cell} color={colors.ok} />
        <View style={styles.text}>
          <Text style={styles.title}>{copy.sharingTitle}</Text>
          <Text style={styles.body}>{copy.sharingBody}</Text>
          {queuedPoints > 0 ? <Text style={styles.body}>{copy.queued(queuedPoints)}</Text> : null}
        </View>
      </View>
    </Group>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + spacing.xs,
      minHeight: shape.cellMinHeight,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
    },
    text: { flex: 1, gap: spacing.xs / 2 },
    title: { ...type.headline, color: colors.okText },
    body: { ...type.subhead, color: colors.textDim },
    action: { marginTop: spacing.xs, alignItems: 'flex-start' },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
