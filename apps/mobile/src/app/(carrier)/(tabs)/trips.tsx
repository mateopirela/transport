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

import { Badge, Card, Loaded, SectionTitle } from '../../../components/fleet-ui';
import { TripMap } from '../../../components/trip-map';
import { PositionLine, tripStatusTone } from '../../../components/trip-position';
import { Body, Button, Screen, Title } from '../../../components/ui';
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

  return (
    <Screen>
      <Title subtitle={copy.subtitle}>{copy.title}</Title>
      <Loaded state={state} onRetry={refresh}>
        {({ trips, hasMoreHistory }) => {
          if (trips.length === 0) return <Body>{copy.none}</Body>;
          const groups = groupCarrierTrips(trips);
          return (
            <>
              {CARRIER_TRIP_GROUPS.map((group) => (
                <Group key={group} group={group} trips={groups[group]} onOpen={open} />
              ))}
              {hasMoreHistory ? (
                <Button
                  label={copy.moreHistory}
                  variant="link"
                  onPress={() => setHistoryLimit((limit) => limit + HISTORY_PAGE_SIZE)}
                />
              ) : null}
            </>
          );
        }}
      </Loaded>
      <Button label={copy.refresh} variant="secondary" onPress={refresh} />
    </Screen>
  );
}

function Group({
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
  return (
    <>
      <SectionTitle>{copy.groups[group]}</SectionTitle>
      {trips.length === 0 ? <Body>{copy.empty[group]}</Body> : null}
      {group === 'active' && trips.length > 0 ? (
        <>
          <Body>{carrierTripsCopy.monitor.help}</Body>
          <TripMap
            trips={trips.map((t) => ({
              key: t.id,
              origin: { lat: t.load.origin_lat, lng: t.load.origin_lng },
              destination: { lat: t.load.destination_lat, lng: t.load.destination_lng },
              position: t.lastPosition,
            }))}
          />
        </>
      ) : null}
      {trips.map((trip, index) => (
        <TripCard
          key={trip.id}
          trip={trip}
          index={group === 'active' ? index + 1 : null}
          onPress={() => onOpen(trip)}
        />
      ))}
    </>
  );
}

function TripCard({
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
    <Card
      title={index === null ? route : carrierTripsCopy.monitor.legend(index, route)}
      subtitle={copy.pickup(formatDateTime(trip.pickupAt))}
      onPress={onPress}
    >
      <Badge label={tripStatusLabels[trip.status]} tone={tripStatusTone(trip.status)} />
      <Body>
        {trip.unitName && trip.operatorName
          ? copy.assignedTo(trip.unitName, trip.operatorName)
          : copy.unassigned}
      </Body>
      {index !== null ? <PositionLine trip={trip} /> : null}
    </Card>
  );
}
