import {
  carrierLoadsCopy,
  carrierWebCopy,
  formatDateTime,
  formatMxn,
  matchingCopy,
  type Recommendation,
} from '@transport/shared';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { carrierLoadPath } from '@/lib/routing';

const c = carrierLoadsCopy.card;

/** Query parameter with the unit a load was recommended for (preselects it when offering). */
export const RECOMMENDED_UNIT_PARAM = 'camion';

/** A recommended load with the explainable breakdown of its score (B08). */
export function RecommendationCard({
  recommendation: r,
  rank,
  unitLabel,
}: {
  recommendation: Recommendation;
  /** Position in its list, from 1. */
  rank: number;
  unitLabel?: string | undefined;
}) {
  const href = `${carrierLoadPath(r.loadId)}?${RECOMMENDED_UNIT_PARAM}=${r.vehicleId}`;
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{carrierWebCopy.home.rank(rank)}</p>
        <p className="font-medium">{c.route(r.origin.city, r.destination.city)}</p>
        <p className="text-sm text-muted-foreground">
          {c.pickup(formatDateTime(r.pickupWindowStart))}
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {r.breakdown.isReturnTrip && (
            <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
              {matchingCopy.returnTrip}
            </span>
          )}
          {r.breakdown.distanceSource === 'estimate' && (
            <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
              {matchingCopy.estimatedDistance}
            </span>
          )}
        </div>
        <p className="text-sm">{r.explanation}</p>
      </div>
      <div className="space-y-2 text-right">
        <p className="font-medium">{c.price(formatMxn(r.proposedPriceCents))}</p>
        {unitLabel && <p className="text-xs text-muted-foreground">{c.unit(unitLabel)}</p>}
        <Link href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {carrierWebCopy.home.seeLoad}
        </Link>
      </div>
    </li>
  );
}
