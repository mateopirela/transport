import {
  carrierLoadsCopy,
  directionsUrl,
  estimateRoadKm,
  formatDistance,
  type LatLng,
} from '@transport/shared';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

import { lookOf, shape, spacing, useTheme, type Look } from '../theme';
import { Cell, Group } from './ui';

const copy = carrierLoadsCopy.detail;

interface Stop extends LatLng {
  city: string;
  state: string;
}

/**
 * Schematic route of a load, as a group: where the unit is free (when
 * known), the pickup and the delivery on a line of stops, with the empty and
 * loaded km. There is no embedded map yet (it needs the Google Maps SDK keys);
 * "Abrir en mapas" opens the route in the phone's maps app, which needs no key.
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
  const { theme, colors } = useTheme();
  const styles = STYLES[theme];
  const loadedKm = estimateRoadKm(pickup, delivery);
  return (
    <Group>
      <View accessibilityLabel={copy.mapPlaceholder} style={styles.box}>
        {emptyLeg ? (
          <>
            <StopRow color={colors.textFaint} label={emptyLeg.start.city} />
            <Leg text={copy.emptyLeg(formatDistance(emptyLeg.km), emptyLeg.start.city)} dashed />
          </>
        ) : (
          <Text style={styles.leg}>{copy.emptyLegUnknown}</Text>
        )}
        <StopRow color={colors.accent} label={`${pickup.city}, ${pickup.state}`} />
        <Leg text={copy.loadedLeg(formatDistance(loadedKm))} />
        <StopRow color={colors.ok} label={`${delivery.city}, ${delivery.state}`} />
      </View>
      <Cell
        icon="navigate"
        title={copy.openMaps}
        onPress={() => void Linking.openURL(directionsUrl(pickup, delivery, emptyLeg?.start))}
      />
    </Group>
  );
}

function StopRow({ color, label }: { color: string; label: string }) {
  const styles = STYLES[useTheme().theme];
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.stop}>{label}</Text>
    </View>
  );
}

function Leg({ text, dashed = false }: { text: string; dashed?: boolean }) {
  const styles = STYLES[useTheme().theme];
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.line, dashed ? styles.dashed : null]} />
      </View>
      <Text style={styles.leg}>{text}</Text>
    </View>
  );
}

/** The dots and the line between them share one column, as the trip's timeline (§1.7). */
const DOT = spacing.sm + spacing.xs / 2;

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    box: { padding: spacing.md, gap: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
    dot: { width: DOT, height: DOT, borderRadius: shape.pill },
    rail: { width: DOT, alignItems: 'center' },
    stop: type.headline,
    line: { width: 2, height: spacing.lg, backgroundColor: colors.accent },
    dashed: { backgroundColor: colors.separator },
    leg: type.footnote,
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
