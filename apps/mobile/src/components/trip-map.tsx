import { carrierTripsCopy, projectToBox, type LatLng } from '@transport/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { lookOf, shape, spacing, useTheme, type Look } from '../theme';

const copy = carrierTripsCopy.monitor;

const HEIGHT = 220;
const PADDING = spacing.lg;
/** Dots of the stops, of the trail's ends and of the last position (numbered). */
const STOP_DOT = spacing.sm + 2;
const POSITION_DOT = spacing.lg - 2;
const LEGEND_DOT = spacing.sm;

export interface MapTrip {
  key: string;
  origin: LatLng;
  destination: LatLng;
  /** Last GPS point, if any. */
  position: LatLng | null;
  /** Earlier GPS points, oldest first (detail screen only). */
  trail?: readonly LatLng[];
}

/**
 * Schematic map of trips on the road: origin, destination, the trail and the
 * last position of each, numbered as in the list below it. It needs no Maps
 * SDK key (none exists yet): coordinates are projected into the box with one
 * shared scale, north up, on a tile of the page colour with the legend on
 * glass over it. The embedded Google map replaces it when the keys arrive.
 */
export function TripMap({ trips }: { trips: readonly MapTrip[] }) {
  const { theme, colors } = useTheme();
  const styles = STYLES[theme];
  const [width, setWidth] = useState(0);
  const points = trips.flatMap((t) => [
    t.origin,
    t.destination,
    ...(t.trail ?? []),
    ...(t.position ? [t.position] : []),
  ]);
  const projected =
    width > 0 ? projectToBox(points, { width, height: HEIGHT, padding: PADDING }) : [];

  const drawn = layoutTrips(trips, projected);

  return (
    <View
      accessible
      accessibilityLabel={copy.placeholder}
      style={styles.box}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0
        ? drawn.map((t, index) => (
            <View key={t.key} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Segment from={t.origin} to={t.destination} color={colors.textFaint} />
              {t.trail.slice(1).map((p, i) => (
                <Segment key={i} from={t.trail[i] ?? p} to={p} color={colors.accent} />
              ))}
              <Dot at={t.origin} color={colors.accent} size={STOP_DOT} />
              <Dot at={t.destination} color={colors.ok} size={STOP_DOT} />
              {t.position ? (
                <Dot
                  at={t.position}
                  color={colors.text}
                  size={POSITION_DOT}
                  label={String(index + 1)}
                />
              ) : null}
            </View>
          ))
        : null}
      <View style={styles.legend}>
        <LegendDot color={colors.accent} label={copy.origin} />
        <LegendDot color={colors.ok} label={copy.destination} />
        <LegendDot color={colors.text} label={copy.lastPosition} />
      </View>
    </View>
  );
}

interface Point {
  x: number;
  y: number;
}

/** Splits the projected points back per trip, in the order they were flattened. */
function layoutTrips(trips: readonly MapTrip[], projected: readonly Point[]) {
  const at = (index: number): Point => projected[index] ?? { x: 0, y: 0 };
  const result: {
    key: string;
    origin: Point;
    destination: Point;
    trail: Point[];
    position: Point | null;
  }[] = [];
  let offset = 0;
  for (const t of trips) {
    const trailLength = t.trail?.length ?? 0;
    result.push({
      key: t.key,
      origin: at(offset),
      destination: at(offset + 1),
      trail: Array.from({ length: trailLength }, (_, i) => at(offset + 2 + i)),
      position: t.position ? at(offset + 2 + trailLength) : null,
    });
    offset += 2 + trailLength + (t.position ? 1 : 0);
  }
  return result;
}

function Dot({
  at,
  color,
  size,
  label,
}: {
  at: Point;
  color: string;
  size: number;
  label?: string;
}) {
  const styles = STYLES[useTheme().theme];
  return (
    <View
      style={[
        styles.dot,
        {
          left: at.x - size / 2,
          top: at.y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    >
      {label ? <Text style={styles.dotLabel}>{label}</Text> : null}
    </View>
  );
}

/** A straight line between two points: a thin view rotated around its center. */
function Segment({ from, to, color }: { from: Point; to: Point; color: string }) {
  const styles = STYLES[useTheme().theme];
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 1) return null;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return (
    <View
      style={[
        styles.segment,
        {
          backgroundColor: color,
          width: length,
          left: (from.x + to.x) / 2 - length / 2,
          top: (from.y + to.y) / 2 - 1,
          transform: [{ rotate: `${angle}rad` }],
        },
      ]}
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const styles = STYLES[useTheme().theme];
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    box: {
      height: HEIGHT,
      backgroundColor: colors.surfaceHigh,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      borderRadius: shape.card,
      overflow: 'hidden',
    },
    dot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    dotLabel: { ...type.caption, fontFamily: type.headline.fontFamily, color: colors.bg },
    segment: { position: 'absolute', height: 2 },
    legend: {
      position: 'absolute',
      left: spacing.sm,
      bottom: spacing.sm,
      flexDirection: 'row',
      gap: spacing.sm + spacing.xs,
      paddingHorizontal: spacing.sm + spacing.xs,
      paddingVertical: spacing.xs,
      borderRadius: shape.pill,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassLine,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    legendDot: { width: LEGEND_DOT, height: LEGEND_DOT, borderRadius: LEGEND_DOT / 2 },
    legendText: type.caption,
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
