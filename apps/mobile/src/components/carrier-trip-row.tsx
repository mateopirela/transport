import {
  carrierTripsCopy,
  formatDateTime,
  tripStatusLabels,
  tripStatusTone,
} from '@transport/shared';

import type { CarrierTripSummary } from '../lib/carrier-trips-api';
import { StatusRow } from './status-row';
import { PositionLine } from './trip-position';

const copy = carrierTripsCopy.list;

/**
 * A won trip as a row of a list (B20; V8): the route, the pickup, who drives
 * it and its state in the tone of §1.1. `index` numbers a trip on the road as
 * its mark on the map ("1 · Guadalajara → Monterrey") and adds how fresh its
 * last position is.
 */
export function CarrierTripRow({
  trip,
  index = null,
  onPress,
}: {
  trip: CarrierTripSummary;
  index?: number | null;
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
