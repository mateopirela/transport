import {
  cargoTypeLabels,
  carrierLoadsCopy,
  defaultAxleCount,
  formatDateTime,
  formatMxn,
  roadsCopy,
  specialRequirementLabels,
  suggestLoadRoad,
  unitLabel,
  unitTypeLabels,
  vehicleAxles,
  type DwellEstimate,
  type RoadContext,
} from '@transport/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { KeyboardBottomBar } from '../../../components/keyboard-bar';
import { ChatPanel } from '../../../components/chat-panel';
import { DetailRow } from '../../../components/detail-row';
import { useNegotiation } from '../../../components/negotiation-panel';
import { RoutePreview } from '../../../components/route-preview';
import { ShareWithTeamButton } from '../../../components/share-button';
import { SuggestedRoute } from '../../../components/suggested-route';
import {
  Group,
  LoadError,
  Notice,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
  ValueRow,
} from '../../../components/ui';
import {
  emptyLegs,
  hiddenLoadConversationId,
  listCarrierUnits,
  loadWithNegotiation,
  watchLoadOffers,
  type CarrierUnit,
  type EmptyLeg,
  type LoadNegotiation,
} from '../../../lib/loads-api';
import { loadPickupDwell } from '../../../lib/dwell-api';
import { loadRoadContext } from '../../../lib/roads-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { useTheme } from '../../../theme';

const copy = carrierLoadsCopy.detail;

/**
 * Load detail for the carrier (B19): the negotiation with its next step in
 * the bottom bar, the route with the empty km of its nearest compatible unit,
 * the load's data and the chat.
 */
export default function LoadDetail() {
  const { id, vehicleId } = useLocalSearchParams<{ id: string; vehicleId?: string }>();

  const load = useCallback(
    async ({ client, companyId }: CarrierContext) => {
      const [negotiation, units, roads] = await Promise.all([
        loadWithNegotiation(client, companyId, id),
        listCarrierUnits(client, companyId),
        loadRoadContext(client),
      ]);
      // Compatible units nearest first; the unit it was recommended for leads.
      const l = negotiation?.load;
      const [legs, pickupDwell, hiddenChatId] = await Promise.all([
        negotiation ? emptyLegs(client, id, units) : Promise.resolve([]),
        // H5: the typical waiting and loading time at its pickup, at that hour.
        l ? loadPickupDwell(client, l) : Promise.resolve(null),
        // A load won by another carrier: its negotiation's chat stays (the
        // notification of a message opens here).
        negotiation ? Promise.resolve(null) : hiddenLoadConversationId(client, companyId, id),
      ]);
      legs.sort((a, b) => Number(b.vehicleId === vehicleId) - Number(a.vehicleId === vehicleId));
      return { negotiation, units, legs, roads, pickupDwell, hiddenChatId };
    },
    [id, vehicleId],
  );
  const { carrier, state, reload } = useCarrierData(load);

  // New offers or answers of the shipper refresh the negotiation.
  useEffect(() => {
    if (!carrier) return undefined;
    return watchLoadOffers(carrier.client, id, () => void reload());
  }, [carrier, id, reload]);

  const header = <Stack.Screen options={{ title: copy.title }} />;
  if (state.status !== 'ready' || !carrier || !state.data.negotiation) {
    return (
      <Screen belowHeader>
        {header}
        {state.status === 'error' ? (
          <LoadError onRetry={() => void reload()} />
        ) : state.status === 'ready' && carrier ? (
          <>
            <Notice tone="warning">{copy.notFound}</Notice>
            {state.data.hiddenChatId ? (
              <>
                <SectionHeader title={carrierLoadsCopy.chat.title} />
                <ChatPanel client={carrier.client} conversationId={state.data.hiddenChatId} />
              </>
            ) : null}
          </>
        ) : (
          <Skeleton />
        )}
      </Screen>
    );
  }
  return (
    <>
      {header}
      <LoadBody
        carrier={carrier}
        negotiation={state.data.negotiation}
        units={state.data.units}
        legs={state.data.legs}
        roads={state.data.roads}
        pickupDwell={state.data.pickupDwell}
        offerSource={vehicleId ? 'recommendation' : 'search'}
        reload={reload}
      />
    </>
  );
}

function LoadBody({
  carrier,
  negotiation,
  units,
  legs,
  roads,
  pickupDwell,
  offerSource,
  reload,
}: {
  carrier: CarrierContext;
  negotiation: LoadNegotiation;
  units: readonly CarrierUnit[];
  legs: readonly EmptyLeg[];
  roads: RoadContext;
  pickupDwell: DwellEstimate | null;
  offerSource: 'recommendation' | 'search';
  reload: () => Promise<void>;
}) {
  const { type } = useTheme();
  const [barHeight, setBarHeight] = useState(0);
  const l = negotiation.load;
  const best = legs[0];
  const { section, bar } = useNegotiation({
    client: carrier.client,
    data: negotiation,
    units,
    defaultVehicleId: best?.vehicleId,
    offerSource,
    onChanged: reload,
  });
  const route = `${l.origin_city} → ${l.destination_city}`;
  // H4: the suggested road for the unit that leads (its axles pick the toll class).
  const roadUnit = units.find((u) => u.id === best?.vehicleId);
  const roadAxles = roadUnit ? vehicleAxles(roadUnit) : defaultAxleCount('tractor', null);
  const road = suggestLoadRoad(roads, l, roadAxles);

  return (
    <>
      <Screen belowHeader bottom={bar ? barHeight : 0}>
        <Text accessibilityRole="header" style={type.title2}>
          {route}
        </Text>

        {section}

        <SectionHeader title={copy.route} />
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
        <Group>
          <ValueRow label={copy.proposedPrice} value={formatMxn(l.proposed_price_cents)} strong />
          <DetailRow
            label={copy.pickupWindow}
            value={copy.window(
              formatDateTime(l.pickup_window_start),
              formatDateTime(l.pickup_window_end),
            )}
          />
          <DetailRow
            label={copy.deliveryWindow}
            value={copy.window(
              formatDateTime(l.delivery_window_start),
              formatDateTime(l.delivery_window_end),
            )}
          />
          <DetailRow
            label={copy.cargo}
            value={`${cargoTypeLabels[l.cargo_type]} · ${l.description}`}
          />
          <ValueRow label={copy.unitType} value={unitTypeLabels[l.unit_type]} />
          {l.special_requirements.length > 0 ? (
            <DetailRow
              label={copy.requirements}
              value={l.special_requirements.map((r) => specialRequirementLabels[r]).join(', ')}
            />
          ) : null}
          {l.notes ? <DetailRow label={copy.notes} value={l.notes} /> : null}
        </Group>
        <ShareWithTeamButton client={carrier.client} loadId={l.id} route={route} />

        <SuggestedRoute
          road={road}
          estimateFor={roadsCopy.estimateFor(roadUnit ? unitLabel(roadUnit) : null, roadAxles)}
          pickupDwell={pickupDwell}
        />

        <SectionHeader title={carrierLoadsCopy.chat.title} />
        {negotiation.conversationId ? (
          <ChatPanel client={carrier.client} conversationId={negotiation.conversationId} />
        ) : (
          <Group>
            <TextCell tone="dim">{carrierLoadsCopy.chat.unavailable}</TextCell>
          </Group>
        )}
      </Screen>
      {bar ? <KeyboardBottomBar {...bar} onHeight={setBarHeight} /> : null}
    </>
  );
}
