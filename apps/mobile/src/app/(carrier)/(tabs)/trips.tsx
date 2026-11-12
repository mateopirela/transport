import {
  CARRIER_TRIP_GROUPS,
  carrierTripsCopy,
  groupCarrierTrips,
  type CarrierTripGroup,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { CarrierTripRow } from '../../../components/carrier-trip-row';
import { TripMap } from '../../../components/trip-map';
import {
  Button,
  Footnote,
  Group,
  GroupLabel,
  LoadError,
  Screen,
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

/**
 * Won trips of the carrier (B20): to assign, on the road (with the map),
 * upcoming and history, each group with its count. It follows the trips on
 * its own (polling) and refreshes when pulled down.
 */
export default function TripsTab() {
  const router = useRouter();
  // Every unfinished trip is listed; the history grows page by page.
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const loadTrips = useCallback(
    ({ client, companyId }: CarrierContext) => listCarrierTrips(client, companyId, historyLimit),
    [historyLimit],
  );
  const { state, reload } = useCarrierData(loadTrips);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => void reload(), [reload]);
  const pull = useCallback(() => {
    setRefreshing(true);
    void reload().finally(() => setRefreshing(false));
  }, [reload]);
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
    <Screen title={copy.title} subtitle={copy.subtitle} onRefresh={pull} refreshing={refreshing}>
      {content}
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
      {/* The history comes page by page: its count would be the page's. */}
      <GroupLabel>
        {group === 'history' ? copy.groups[group] : `${copy.groups[group]} · ${trips.length}`}
      </GroupLabel>
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
            <CarrierTripRow
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
