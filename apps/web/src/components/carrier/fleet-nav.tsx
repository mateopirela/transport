import { carrierWebCopy } from '@transport/shared';
import Link from 'next/link';

import { paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = carrierWebCopy.fleet;

export type FleetSection = 'units' | 'operators' | 'routes';

const TABS: { section: FleetSection; href: string; label: string }[] = [
  { section: 'units', href: paths.carrierUnits, label: c.tabs.units },
  { section: 'operators', href: paths.carrierOperators, label: c.tabs.operators },
  { section: 'routes', href: paths.carrierRoutes, label: c.tabs.routes },
];

/** Sub-navigation of the fleet (G10b): units, operators and usual routes. */
export function FleetNav({ current }: { current: FleetSection }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm" aria-label={c.title}>
      {TABS.map((tab) => (
        <Link
          key={tab.section}
          href={tab.href}
          aria-current={tab.section === current ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1 hover:bg-muted',
            tab.section === current && 'border-accent bg-accent/10 text-accent',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
