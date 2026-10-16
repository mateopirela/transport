import {
  cargoTypeLabels,
  carrierLoadsCopy,
  formatDateTime,
  formatMxn,
  specialRequirementLabels,
  unitTypeLabels,
} from '@transport/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatPanel } from '../../../components/chat-panel';
import { Loaded, SectionTitle } from '../../../components/fleet-ui';
import { NegotiationPanel } from '../../../components/negotiation-panel';
import { RoutePreview } from '../../../components/route-preview';
import { Body, Notice, Screen } from '../../../components/ui';
import {
  emptyLegs,
  listCarrierUnits,
  loadWithNegotiation,
  watchLoadOffers,
} from '../../../lib/loads-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { colors } from '../../../theme';

const copy = carrierLoadsCopy.detail;

/**
 * Load detail for the carrier (B19): route with the empty km of its nearest
 * compatible unit, the load's data, the negotiation and its chat.
 */
export default function LoadDetail() {
  const { id, vehicleId } = useLocalSearchParams<{ id: string; vehicleId?: string }>();

  const load = useCallback(
    async ({ client, companyId }: CarrierContext) => {
      const [negotiation, units] = await Promise.all([
        loadWithNegotiation(client, companyId, id),
        listCarrierUnits(client, companyId),
      ]);
      // Compatible units nearest first; the unit it was recommended for leads.
      const legs = negotiation ? await emptyLegs(client, id, units) : [];
      legs.sort((a, b) => Number(b.vehicleId === vehicleId) - Number(a.vehicleId === vehicleId));
      return { negotiation, units, legs };
    },
    [id, vehicleId],
  );
  const { carrier, state, reload } = useCarrierData(load);

  // New offers or answers of the shipper refresh the negotiation.
  useEffect(() => {
    if (!carrier) return undefined;
    return watchLoadOffers(carrier.client, id, () => void reload());
  }, [carrier, id, reload]);

  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.title }} />
      <Loaded state={state} onRetry={() => void reload()}>
        {({ negotiation, units, legs }) => {
          if (!negotiation || !carrier) return <Notice tone="warning">{copy.notFound}</Notice>;
          const l = negotiation.load;
          const best = legs[0];
          return (
            <>
              <SectionTitle>{copy.route}</SectionTitle>
              <RoutePreview
                pickup={{
                  city: l.origin_city,
                  state: l.origin_state,
                  lat: l.origin_lat,
                  lng: l.origin_lng,
                }}
                delivery={{
                  city: l.destination_city,
                  state: l.destination_state,
                  lat: l.destination_lat,
                  lng: l.destination_lng,
                }}
                emptyLeg={best ? { km: best.emptyKm, start: best.start } : null}
              />
              <Row label={copy.proposedPrice} value={formatMxn(l.proposed_price_cents)} strong />
              <Row
                label={copy.pickupWindow}
                value={copy.window(
                  formatDateTime(l.pickup_window_start),
                  formatDateTime(l.pickup_window_end),
                )}
              />
              <Row
                label={copy.deliveryWindow}
                value={copy.window(
                  formatDateTime(l.delivery_window_start),
                  formatDateTime(l.delivery_window_end),
                )}
              />
              <Row
                label={copy.cargo}
                value={`${cargoTypeLabels[l.cargo_type]} · ${l.description}`}
              />
              <Row label={copy.unitType} value={unitTypeLabels[l.unit_type]} />
              {l.special_requirements.length > 0 ? (
                <Row
                  label={copy.requirements}
                  value={l.special_requirements.map((r) => specialRequirementLabels[r]).join(', ')}
                />
              ) : null}
              {l.notes ? <Row label={copy.notes} value={l.notes} /> : null}

              <NegotiationPanel
                client={carrier.client}
                data={negotiation}
                units={units}
                defaultVehicleId={best?.vehicleId}
                offerSource={vehicleId ? 'recommendation' : 'search'}
                onChanged={reload}
              />

              <SectionTitle>{carrierLoadsCopy.chat.title}</SectionTitle>
              {negotiation.conversationId ? (
                <ChatPanel client={carrier.client} conversationId={negotiation.conversationId} />
              ) : (
                <Body>{carrierLoadsCopy.chat.unavailable}</Body>
              )}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, strong ? styles.strong : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 15, color: colors.text, lineHeight: 21 },
  strong: { fontSize: 18, fontWeight: '700', color: colors.navy },
});
