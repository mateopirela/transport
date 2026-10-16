import {
  carrierLoadsCopy,
  directionsUrl,
  estimateRoadKm,
  formatDistance,
  type LatLng,
} from '@transport/shared';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';
import { Button } from './ui';

const copy = carrierLoadsCopy.detail;

interface Stop extends LatLng {
  city: string;
  state: string;
}

/**
 * Schematic route of a load: where the unit is free (when known), the pickup
 * and the delivery, with the empty and loaded km. There is no embedded map
 * yet (it needs the Google Maps SDK keys); "Abrir en mapas" opens the route in
 * the phone's maps app, which needs no key.
 */
export function RoutePreview({
  pickup,
  delivery,
  emptyLeg,
}: {
  pickup: Stop;
  delivery: Stop;
  emptyLeg: { km: number; start: LatLng & { city: string } } | null;
}) {
  const loadedKm = estimateRoadKm(pickup, delivery);
  return (
    <View accessibilityLabel={copy.mapPlaceholder} style={styles.box}>
      {emptyLeg ? (
        <>
          <StopRow color={colors.textMuted} label={emptyLeg.start.city} />
          <Leg text={copy.emptyLeg(formatDistance(emptyLeg.km), emptyLeg.start.city)} dashed />
        </>
      ) : (
        <Text style={styles.muted}>{copy.emptyLegUnknown}</Text>
      )}
      <StopRow color={colors.accent} label={`${pickup.city}, ${pickup.state}`} />
      <Leg text={copy.loadedLeg(formatDistance(loadedKm))} />
      <StopRow color={colors.success} label={`${delivery.city}, ${delivery.state}`} />
      <Button
        label={copy.openMaps}
        variant="secondary"
        onPress={() => void Linking.openURL(directionsUrl(pickup, delivery, emptyLeg?.start))}
      />
    </View>
  );
}

function StopRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.stop}>{label}</Text>
    </View>
  );
}

function Leg({ text, dashed = false }: { text: string; dashed?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={[styles.line, dashed ? styles.dashed : null]} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.infoSurface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  dot: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 2 },
  stop: { fontSize: 15, fontWeight: '600', color: colors.text },
  line: { width: 2, height: 24, marginHorizontal: 7, backgroundColor: colors.accent },
  dashed: { backgroundColor: colors.textMuted, opacity: 0.6 },
  muted: { fontSize: 13, color: colors.textMuted },
});
