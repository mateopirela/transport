import {
  APP_LOCALE,
  carrierLoadsCopy,
  formatDateTime,
  formatMxn,
  matchingCopy,
  unitTypeLabels,
  type Recommendation,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { CarrierLoad } from '../lib/loads-api';
import { track } from '../lib/track';
import { lookOf, spacing, useTheme, type Look } from '../theme';
import { Cell, Pill } from './ui';

const copy = carrierLoadsCopy.card;

/** Route, to open the load detail (with the unit it was recommended for). */
function useOpenLoad() {
  const router = useRouter();
  return (loadId: string, vehicleId?: string) =>
    router.push({
      pathname: '/load/[id]',
      params: vehicleId ? { id: loadId, vehicleId } : { id: loadId },
    });
}

/**
 * A recommended load, as a row of a group: the route, the pickup, the
 * explainable breakdown of its score (B08), its tags and the price.
 */
export function RecommendationCell({
  recommendation: r,
  rank,
  unitLabel,
}: {
  recommendation: Recommendation;
  /** Position in its list, from 1 (product events, B25). */
  rank: number;
  unitLabel?: string | undefined;
}) {
  const styles = STYLES[useTheme().theme];
  const open = useOpenLoad();
  function onPress() {
    track({
      name: 'recommendation_opened',
      loadId: r.loadId,
      properties: {
        vehicle_id: r.vehicleId,
        rank,
        score: r.score,
        return_trip: r.breakdown.isReturnTrip,
      },
    });
    open(r.loadId, r.vehicleId);
  }
  const returnTrip = r.breakdown.isReturnTrip;
  const estimated = r.breakdown.distanceSource === 'estimate';
  return (
    <Cell role="link" onPress={onPress}>
      <Text style={styles.title}>{copy.route(r.origin.city, r.destination.city)}</Text>
      <Text style={styles.dim}>{copy.pickup(formatDateTime(r.pickupWindowStart))}</Text>
      <Text style={styles.body} numberOfLines={3}>
        {r.explanation}
      </Text>
      <Text style={styles.price}>{copy.price(formatMxn(r.proposedPriceCents))}</Text>
      {unitLabel ? <Text style={styles.dim}>{copy.unit(unitLabel)}</Text> : null}
      {returnTrip || estimated ? (
        <View style={styles.pills}>
          {returnTrip ? <Pill label={matchingCopy.returnTrip} tone="ok" /> : null}
          {estimated ? <Pill label={matchingCopy.estimatedDistance} /> : null}
        </View>
      ) : null}
    </Cell>
  );
}

const kg = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });

/** A load of the search or of a negotiation, as a row of a group; `footer` is the negotiation's state. */
export function LoadCell({ load, footer }: { load: CarrierLoad; footer?: string }) {
  const styles = STYLES[useTheme().theme];
  const open = useOpenLoad();
  return (
    <Cell role="link" onPress={() => open(load.id)}>
      <Text style={styles.title}>{copy.route(load.origin_city, load.destination_city)}</Text>
      <Text style={styles.dim}>{copy.pickup(formatDateTime(load.pickup_window_start))}</Text>
      <Text style={styles.dim}>
        {[unitTypeLabels[load.unit_type], copy.weight(kg.format(Number(load.weight_kg)))].join(
          ' · ',
        )}
      </Text>
      <Text style={styles.price}>{copy.price(formatMxn(load.proposed_price_cents))}</Text>
      {footer ? <Text style={styles.accent}>{footer}</Text> : null}
    </Cell>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    title: type.headline,
    body: type.subhead,
    dim: type.footnote,
    price: { ...type.subhead, ...type.num, fontFamily: type.headline.fontFamily },
    accent: { ...type.subhead, color: colors.accentText },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
