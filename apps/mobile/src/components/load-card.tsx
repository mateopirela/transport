import {
  brokeredCopy,
  APP_LOCALE,
  carrierLoadsCopy,
  carrierNegotiationTone,
  carrierWebCopy,
  dwellCopy,
  formatDateTime,
  cardRoad,
  matchingCopy,
  roadsCopy,
  unitTypeLabels,
  type CarrierNegotiationState,
  type Recommendation,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CarrierLoad } from '../lib/loads-api';
import { track } from '../lib/track';
import { lookOf, spacing, useTheme, type Look } from '../theme';
import { Cell, Money, Pill, type PillTone } from './ui';

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
 * The body of a load's row (V8): the route and, beside it, the freight the
 * carrier would get, the figure that decides; under them its lines and its
 * pills. Read as one element, the route first.
 */
function LoadRow({
  route,
  cents,
  lines,
  pills,
  children,
}: {
  route: string;
  cents: number;
  lines: readonly (string | null | false | undefined)[];
  pills: readonly { label: string; tone: PillTone }[];
  children?: ReactNode;
}) {
  const styles = STYLES[useTheme().theme];
  return (
    <>
      <View style={styles.top}>
        <Text style={styles.route}>{route}</Text>
        <Money cents={cents} size="headline" align="right" />
      </View>
      {lines.map((line, i) =>
        line ? (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        ) : null,
      )}
      {children}
      {pills.length > 0 ? (
        <View style={styles.pills}>
          {pills.map((pill) => (
            <Pill key={pill.label} label={pill.label} tone={pill.tone} />
          ))}
        </View>
      ) : null}
    </>
  );
}

/**
 * A recommended load, as a row of a group: the route and its freight, the
 * pickup, the explainable breakdown of its score (B08) and its tags.
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
  // H4: estimated tolls of the suggested road, and a warning when it crosses a
  // high-risk segment inside its band.
  const { tolls, risky } = cardRoad(r.road);
  const pills: { label: string; tone: PillTone }[] = [
    ...(returnTrip ? [{ label: matchingCopy.returnTrip, tone: 'done' as const }] : []),
    ...(estimated ? [{ label: matchingCopy.estimatedDistance, tone: 'inactive' as const }] : []),
    ...(tolls ? [{ label: tolls, tone: 'inactive' as const }] : []),
    ...(risky ? [{ label: roadsCopy.cardHighRisk, tone: 'problem' as const }] : []),
  ];
  return (
    <Cell role="link" onPress={onPress}>
      <LoadRow
        route={copy.route(r.origin.city, r.destination.city)}
        cents={r.proposedPriceCents}
        lines={[
          copy.pickup(formatDateTime(r.pickupWindowStart)),
          returnTrip && r.returnDwell ? dwellCopy.returnTrip(r.returnDwell) : null,
          unitLabel ? copy.unit(unitLabel) : null,
        ]}
        pills={pills}
      >
        <Text style={styles.body} numberOfLines={3}>
          {r.explanation}
        </Text>
      </LoadRow>
    </Cell>
  );
}

const kg = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });

/**
 * A load of the search or of a negotiation, as a row of a group: the route
 * and its freight, the pickup, the unit and the weight; a negotiation's
 * `state` on its pill, in the tone that says whose turn it is.
 */
export function LoadCell({ load, state }: { load: CarrierLoad; state?: CarrierNegotiationState }) {
  const open = useOpenLoad();
  const pills: { label: string; tone: PillTone }[] = [
    ...(state
      ? [
          {
            label: carrierWebCopy.negotiations.stateLabels[state],
            tone: carrierNegotiationTone(state),
          },
        ]
      : []),
    ...(load.brokered ? [{ label: brokeredCopy.badge, tone: 'inactive' as const }] : []),
  ];
  return (
    <Cell role="link" onPress={() => open(load.id)}>
      <LoadRow
        route={copy.route(load.origin_city, load.destination_city)}
        cents={load.proposed_price_cents}
        lines={[
          copy.pickup(formatDateTime(load.pickup_window_start)),
          [unitTypeLabels[load.unit_type], copy.weight(kg.format(Number(load.weight_kg)))].join(
            ' · ',
          ),
        ]}
        pills={pills}
      />
    </Cell>
  );
}

function makeStyles({ type }: Look) {
  return StyleSheet.create({
    top: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    route: { ...type.headline, flex: 1 },
    line: type.footnote,
    body: { ...type.footnote, color: type.body.color, marginTop: spacing.xs },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
