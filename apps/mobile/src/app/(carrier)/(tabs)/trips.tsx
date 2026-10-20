import {
  CARRIER_TRIP_GROUPS,
  carrierTripsCopy,
  formatDateTime,
  groupCarrierTrips,
  tripStatusLabels,
  type CarrierTripGroup,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { StatusRow } from '../../../components/status-row';
import { TripMap } from '../../../components/trip-map';
import { PositionLine, tripStatusTone } from '../../../components/trip-position';
import {
  Button,
  Footnote,
  Group,
  LoadError,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
} from '../../../components/ui';
import {
  HISTORY_PAGE_SIZE,
  listCarrierTrips,
  type CarrierTripSummary,
} from '../../../lib/carrier-trips-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { usePolling } from '../../../lib/use-polling';

const copy = carrierTripsCopy.list;

/** Won trips of the carrier (B20): to assign, on the road (with the map), upcoming and history. */
export default function TripsTab() {
  const router = useRouter();
  // Every unfinished trip is listed; the history grows page by page.
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const loadTrips = useCallback(
    ({ client, companyId }: CarrierContext) => listCarrierTrips(client, companyId, historyLimit),
    [historyLimit],
  );
  const { state, reload } = useCarrierData(loadTrips);
  const refresh = useCallback(() => void reload(), [reload]);
  usePolling(refresh);

  const open = (trip: CarrierTripSummary) =>
    router.push({ pathname: '/trip/[id]', params: { id: trip.id } });

  let content;
  if (state.status === 'loading') content = <Skeleton />;
  else if (state.status === 'error') content = <LoadError onRetry={refresh} />;
  else if (state.data.trips.length === 0) {
    content = (
      <Group>
        <TextCell tone="dim">{copy.none}</TextCell>
      </Group>
    );
  } else {
    const groups = groupCarrierTrips(state.data.trips);
    content = (
      <>
        {CARRIER_TRIP_GROUPS.map((group) => (
          <TripGroup key={group} group={group} trips={groups[group]} onOpen={open} />
        ))}
        {state.data.hasMoreHistory ? (
          <Button
            label={copy.moreHistory}
            variant="plain"
            onPress={() => setHistoryLimit((limit) => limit + HISTORY_PAGE_SIZE)}
          />
        ) : null}
      </>
    );
  }

  return (
    <Screen title={copy.title} subtitle={copy.subtitle}>
      {content}
      <Button label={copy.refresh} variant="secondary" icon="refresh" onPress={refresh} />
    </Screen>
  );
}

function TripGroup({
  group,
  trips,
  onOpen,
}: {
  group: CarrierTripGroup;
  trips: CarrierTripSummary[];
  onOpen: (trip: CarrierTripSummary) => void;
}) {
  // Empty sections other than "por asignar" and "en curso" are left out.
  if (trips.length === 0 && (group === 'upcoming' || group === 'history')) return null;
  const active = group === 'active' && trips.length > 0;
  return (
    <>
      <SectionHeader title={copy.groups[group]} />
      {trips.length === 0 ? (
        <Group>
          <TextCell tone="dim">{copy.empty[group]}</TextCell>
        </Group>
      ) : (
        <Group>
          {active ? (
            <TripMap
              trips={trips.map((t) => ({
                key: t.id,
                origin: { lat: t.load.origin_lat, lng: t.load.origin_lng },
                destination: { lat: t.load.destination_lat, lng: t.load.destination_lng },
                position: t.lastPosition,
              }))}
            />
          ) : null}
          {trips.map((trip, index) => (
            <TripCell
              key={trip.id}
              trip={trip}
              index={group === 'active' ? index + 1 : null}
              onPress={() => onOpen(trip)}
            />
          ))}
        </Group>
      )}
      {active ? <Footnote>{carrierTripsCopy.monitor.help}</Footnote> : null}
    </>
  );
}

function TripCell({
  trip,
  index,
  onPress,
}: {
  trip: CarrierTripSummary;
  index: number | null;
  onPress: () => void;
}) {
  const route = copy.route(trip.load.origin_city, trip.load.destination_city);
  return (
    <StatusRow
      strong
      title={index === null ? route : carrierTripsCopy.monitor.legend(index, route)}
      lines={[
        copy.pickup(formatDateTime(trip.pickupAt)),
        trip.unitName && trip.operatorName
          ? copy.assignedTo(trip.unitName, trip.operatorName)
          : copy.unassigned,
      ]}
      pill={{ label: tripStatusLabels[trip.status], tone: tripStatusTone(trip.status) }}
      onPress={onPress}
    >
      {index !== null ? <PositionLine trip={trip} /> : null}
    </StatusRow>
  );
}
