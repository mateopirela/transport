import Ionicons from '@expo/vector-icons/Ionicons';
import { trackingCopy as copy } from '@transport/shared';
import { useRouter, useSegments } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { TripTracking } from '../lib/use-trip-tracking';
import { colors, spacing } from '../theme';
import { Body, Button, Notice } from './ui';

/** "Compartiendo ubicación" indicator of the trip screen, or what is missing (B22). */
export function TrackingBanner({ tracking }: { tracking: TripTracking }) {
  const router = useRouter();
  // The hombre-camión sees the trip inside the carrier area (D13).
  const inCarrierArea = useSegments()[0] === '(carrier)';
  const { decision, unavailable, queuedPoints } = tracking;

  if (decision === 'needs_consent' || decision === 'needs_permission') {
    const consent = decision === 'needs_consent';
    return (
      <Notice tone="warning" title={consent ? copy.needsConsentTitle : copy.needsPermissionTitle}>
        <Body>{consent ? copy.needsConsentBody : copy.needsPermissionBody}</Body>
        <Button
          label={consent ? copy.needsConsentAction : copy.needsPermissionAction}
          variant="secondary"
          onPress={() => router.push(inCarrierArea ? '/my-trip-consent' : '/location-consent')}
        />
      </Notice>
    );
  }
  if (decision !== 'track') return null;
  if (unavailable) return <Notice tone="warning">{copy.unavailable}</Notice>;
  return (
    <View
      style={styles.banner}
      accessibilityRole="summary"
      accessibilityLabel={`${copy.sharingTitle}. ${copy.sharingBody}`}
    >
      <Ionicons name="locate" size={20} color={colors.success} />
      <View style={styles.text}>
        <Text style={styles.title}>{copy.sharingTitle}</Text>
        <Text style={styles.body}>{copy.sharingBody}</Text>
        {queuedPoints > 0 ? <Text style={styles.body}>{copy.queued(queuedPoints)}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.successSurface,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: colors.success },
  body: { fontSize: 14, color: colors.text },
});
