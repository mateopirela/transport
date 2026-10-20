import {
  carrierTripsCopy,
  formatDate,
  formatDateTime,
  formatTime,
  loadedLegProgress,
  locationFreshness,
  mapPointUrl,
  type TripStatus,
} from '@transport/shared';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

import type { CarrierTripSummary } from '../lib/carrier-trips-api';
import { lookOf, spacing, useTheme, type Look } from '../theme';
import type { Tone } from './fleet-ui';
import { Button } from './ui';

const copy = carrierTripsCopy.monitor;

/** Badge tone of a trip status in the carrier's screens. */
export function tripStatusTone(status: TripStatus): Tone {
  if (status === 'pending_assignment') return 'warning';
  if (status === 'cancelled') return 'danger';
  if (status === 'delivered' || status === 'closed') return 'success';
  return 'info';
}

/** Statuses after loading: the progress counts the loaded leg. */
const LOADED: readonly TripStatus[] = ['in_transit', 'at_delivery', 'unloading'];

/**
 * How fresh the last position of a trip on the road is ("sin señal desde
 * HH:MM" after 15 min, in amber) and, once loaded, the share of the trip
 * covered. With `withLink`, a button opens the position in the phone's maps app.
 */
export function PositionLine({
  trip,
  withLink = false,
}: {
  trip: CarrierTripSummary;
  withLink?: boolean;
}) {
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
      {withLink && position ? (
        <View style={styles.action}>
          <Button
            label={copy.openPosition}
            icon="location"
            variant="secondary"
            size="small"
            onPress={() => void Linking.openURL(mapPointUrl(position))}
          />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    box: { gap: spacing.xs },
    text: { ...type.subhead, ...type.num, color: colors.textDim },
    warning: { fontFamily: type.headline.fontFamily, color: colors.amberText },
    action: { marginTop: spacing.xs, alignItems: 'flex-start' },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
