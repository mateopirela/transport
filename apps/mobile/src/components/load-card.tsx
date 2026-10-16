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
import { colors, spacing } from '../theme';
import { Badge, Card } from './fleet-ui';

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

/** A recommended load with the explainable breakdown of its score (B08). */
export function RecommendationCard({
  recommendation: r,
  unitLabel,
}: {
  recommendation: Recommendation;
  unitLabel?: string | undefined;
}) {
  const open = useOpenLoad();
  return (
    <Card
      title={copy.route(r.origin.city, r.destination.city)}
      subtitle={copy.pickup(formatDateTime(r.pickupWindowStart))}
      onPress={() => open(r.loadId, r.vehicleId)}
    >
      <View style={styles.badges}>
        {r.breakdown.isReturnTrip ? <Badge label={matchingCopy.returnTrip} tone="success" /> : null}
        {r.breakdown.distanceSource === 'estimate' ? (
          <Badge label={matchingCopy.estimatedDistance} tone="neutral" />
        ) : null}
      </View>
      <Text style={styles.explanation}>{r.explanation}</Text>
      <Text style={styles.price}>{copy.price(formatMxn(r.proposedPriceCents))}</Text>
      {unitLabel ? <Text style={styles.muted}>{copy.unit(unitLabel)}</Text> : null}
    </Card>
  );
}

const kg = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });

/** A load of the search results. */
export function LoadCard({ load, footer }: { load: CarrierLoad; footer?: string }) {
  const open = useOpenLoad();
  return (
    <Card
      title={copy.route(load.origin_city, load.destination_city)}
      subtitle={copy.pickup(formatDateTime(load.pickup_window_start))}
      onPress={() => open(load.id)}
    >
      <Text style={styles.muted}>
        {[unitTypeLabels[load.unit_type], copy.weight(kg.format(Number(load.weight_kg)))].join(
          ' · ',
        )}
      </Text>
      <Text style={styles.price}>{copy.price(formatMxn(load.proposed_price_cents))}</Text>
      {footer ? <Text style={styles.muted}>{footer}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  explanation: { fontSize: 14, color: colors.text, lineHeight: 20 },
  price: { fontSize: 15, fontWeight: '600', color: colors.navy },
  muted: { fontSize: 13, color: colors.textMuted },
});
