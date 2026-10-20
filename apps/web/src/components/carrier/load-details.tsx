import {
  APP_LOCALE,
  cargoTypeLabels,
  carrierWebCopy,
  formatDateTime,
  formatMxn,
  loadStatusLabels,
  specialRequirementLabels,
  unitTypeLabels,
} from '@transport/shared';

import { FactList } from '@/components/carrier/fact-list';
import type { CarrierLoad } from '@/lib/carrier/loads';

const c = carrierWebCopy.detail;
const number = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 });

/** The data of a load as the carrier sees it: windows, cargo, unit, price and notes. */
export function LoadDetails({ load, columns }: { load: CarrierLoad; columns?: 1 | 2 }) {
  const window = (start: string, end: string) =>
    c.window(formatDateTime(start), formatDateTime(end));
  // Label and value; rows without a value are left out.
  const rows: [string, string | null][] = [
    [c.labels.status, loadStatusLabels[load.status]],
    [c.labels.pickup, window(load.pickup_window_start, load.pickup_window_end)],
    [c.labels.delivery, window(load.delivery_window_start, load.delivery_window_end)],
    [c.labels.cargoType, cargoTypeLabels[load.cargo_type]],
    [c.labels.cargo, load.description],
    [c.labels.weight, c.weightValue(number.format(load.weight_kg))],
    [
      c.labels.volume,
      load.volume_m3 === null ? null : c.volumeValue(number.format(load.volume_m3)),
    ],
    [c.labels.unitType, unitTypeLabels[load.unit_type]],
    [
      c.labels.requirements,
      load.special_requirements.length === 0
        ? c.labels.noRequirements
        : load.special_requirements.map((r) => specialRequirementLabels[r]).join(', '),
    ],
    [c.labels.price, formatMxn(load.proposed_price_cents)],
    [c.labels.notes, load.notes],
  ];
  return <FactList rows={rows} columns={columns} />;
}

/** "Monterrey → Guadalajara", the heading of every load screen. */
export function loadRoute(load: Pick<CarrierLoad, 'origin_city' | 'destination_city'>): string {
  return `${load.origin_city} → ${load.destination_city}`;
}
