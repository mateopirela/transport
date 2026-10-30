import {
  carrierLoadsCopy,
  carrierWebCopy,
  dwellCopy,
  formatDateTime,
  formatMxn,
  cardRoad,
  matchingCopy,
  roadsCopy,
  type Recommendation,
} from '@transport/shared';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { carrierLoadPath } from '@/lib/routing';

const c = carrierLoadsCopy.card;

/** Query parameter with the unit a load was recommended for (preselects it when offering). */
export const RECOMMENDED_UNIT_PARAM = 'camion';

/** The list the cards go in: one white group, the rows split by inset hairlines. */
export const RECOMMENDATION_LIST = 'overflow-hidden rounded-2xl border bg-cell';

/**
 * A recommended load with the explainable breakdown of its score (B08): a row
 * of `RECOMMENDATION_LIST` with the route, the pickup and the reasons on the
 * left, the price and "Ver carga" on the right. The row is a size container:
 * when it is narrower than `@lg` (a phone), the price and "Ver carga" go
 * below the reasons, so the text keeps the full width and the pills fit.
 */
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
  // H4: estimated tolls of the suggested road and a warning when it crosses a
  // high-risk segment inside its band.
  const { tolls, risky } = cardRoad(r.road);
  return (
    <li className={`${groupRow} @container px-4 py-4`}>
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:justify-between @lg:gap-4">
        <div className="min-w-0 space-y-1 @lg:flex-1">
          <p className="text-footnote text-text-faint tabular-nums">
            {carrierWebCopy.home.rank(rank)}
          </p>
          <p className="text-headline text-text">{c.route(r.origin.city, r.destination.city)}</p>
          <p className="text-subhead text-text-dim">
            {c.pickup(formatDateTime(r.pickupWindowStart))}
          </p>
          {r.breakdown.isReturnTrip && r.returnDwell && (
            <p className="text-subhead text-text-dim tabular-nums">
              {dwellCopy.returnTrip(r.returnDwell)}
            </p>
          )}
          {(r.breakdown.isReturnTrip ||
            r.breakdown.distanceSource === 'estimate' ||
            tolls ||
            risky) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {r.breakdown.isReturnTrip && <Pill tone="ok">{matchingCopy.returnTrip}</Pill>}
              {r.breakdown.distanceSource === 'estimate' && (
                <Pill>{matchingCopy.estimatedDistance}</Pill>
              )}
              {tolls && <Pill>{tolls}</Pill>}
              {risky && (
                <Pill tone="red" aria-label={roadsCopy.cardHighRiskLabel}>
                  <TriangleAlert aria-hidden className="size-3.5" />
                  {roadsCopy.cardHighRisk}
                </Pill>
              )}
            </div>
          )}
          <p className="pt-1 text-subhead text-text">{r.explanation}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 @lg:shrink-0 @lg:flex-col @lg:flex-nowrap @lg:items-end @lg:justify-start">
          <div className="min-w-0 @lg:text-right">
            <p className="text-headline text-text tabular-nums">
              {c.price(formatMxn(r.proposedPriceCents))}
            </p>
            {unitLabel && <p className="text-footnote text-text-dim">{c.unit(unitLabel)}</p>}
          </div>
          <Link href={href} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            {carrierWebCopy.home.seeLoad}
          </Link>
        </div>
      </div>
    </li>
  );
}
