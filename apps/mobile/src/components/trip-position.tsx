import {
  carrierTripsCopy,
  formatDate,
  formatDateTime,
  formatTime,
  loadedLegProgress,
  locationFreshness,
  type TripStatus,
} from '@transport/shared';
import { StyleSheet, Text, View } from 'react-native';

import type { CarrierTripSummary } from '../lib/carrier-trips-api';
import { lookOf, spacing, useTheme, type Look } from '../theme';
import type { PillTone } from './ui';

const copy = carrierTripsCopy.monitor;

/** Pill tone of a trip status in the carrier's screens. */
export function tripStatusTone(status: TripStatus): PillTone {
  if (status === 'pending_assignment') return 'amber';
  if (status === 'cancelled') return 'red';
  if (status === 'delivered' || status === 'closed') return 'ok';
  return 'accent';
}

/** Statuses after loading: the progress counts the loaded leg. */
const LOADED: readonly TripStatus[] = ['in_transit', 'at_delivery', 'unloading'];

/**
 * How fresh the last position of a trip on the road is ("sin señal desde
 * HH:MM" after 15 min) and, once loaded, the share of the trip covered.
 * The trip screen links the position to the phone's maps app next to it.
 */
export function PositionLine({ trip }: { trip: CarrierTripSummary }) {
  const styles = STYLES[useTheme().theme];
  const now = new Date();
  const position = trip.lastPosition;
  const freshness = locationFreshness(position?.recordedAt ?? null, now);
  const text =
    !position || freshness === 'none'
      ? copy.none
      : freshness === 'stale'
        ? copy.stale(
            // A bare time would mislead after a gap of more than a day.
            formatDate(position.recordedAt) === formatDate(now)
              ? formatTime(position.recordedAt)
              : formatDateTime(position.recordedAt),
          )
        : copy.live(Math.round((now.getTime() - Date.parse(position.recordedAt)) / 60_000));
  const progress =
    position && LOADED.includes(trip.status)
      ? Math.round(
          100 *
            loadedLegProgress(
              { lat: trip.load.origin_lat, lng: trip.load.origin_lng },
              { lat: trip.load.destination_lat, lng: trip.load.destination_lng },
              position,
            ),
        )
      : null;
  return (
    <View style={styles.box}>
      <Text style={[styles.text, freshness === 'live' ? null : styles.warning]}>{text}</Text>
      {progress !== null ? <Text style={styles.text}>{copy.progress(progress)}</Text> : null}
    </View>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    box: { gap: spacing.xs },
    text: type.footnote,
    warning: { color: colors.amberText, fontFamily: type.label.fontFamily },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
