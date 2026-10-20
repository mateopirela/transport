import { carrierWebCopy } from '@transport/shared';

import { Segmented } from '@/components/ui/segmented';
import { paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export type FleetSection = 'units' | 'operators' | 'routes';

const TABS: { value: FleetSection; href: string; label: string }[] = [
  { value: 'units', href: paths.carrierUnits, label: c.tabs.units },
  { value: 'operators', href: paths.carrierOperators, label: c.tabs.operators },
  { value: 'routes', href: paths.carrierRoutes, label: c.tabs.routes },
];

/** Sub-navigation of the fleet (G10b): units, operators and usual routes, as a segmented control. */
export function FleetNav({ current }: { current: FleetSection }) {
  return <Segmented items={TABS} value={current} label={c.title} className="mb-8" />;
}
