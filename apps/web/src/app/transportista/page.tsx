import { carrierLoadsCopy, carrierWebCopy, unitLabel } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { RecommendationCard } from '@/components/carrier/recommendation-card';
import { buttonVariants } from '@/components/ui/button';
import { carrierContext } from '@/lib/carrier/context';
import { carrierFeed, listCarrierUnits } from '@/lib/carrier/loads';
import { paths } from '@/lib/routing';

const c = carrierWebCopy.home;
const feedCopy = carrierLoadsCopy.home;

export const metadata: Metadata = { title: c.title };

/**
 * Carrier home (G10a): the recommendations of every unit of the selected
 * business units (B08), return trips first (B19). Units that are not ready
 * (documents, availability) simply get none.
 */
export default async function CarrierHomePage() {
  const { supabase, viewer, companyId, units } = await carrierContext(paths.carrier);
  const carrierUnits = await listCarrierUnits(supabase, companyId, units.ids);
  const feed = carrierUnits.length > 0 ? await carrierFeed(supabase, carrierUnits) : null;
  const labels = new Map(carrierUnits.map((u) => [u.id, unitLabel(u)]));

  return (
    <>
      <PageHeading title={viewer.company?.legalName ?? c.title} description={c.description} />
      {units.operable.length === 0 ? (
        <Notice tone="info">{carrierWebCopy.businessUnit.none}</Notice>
      ) : !feed ? (
        <Notice tone="info">{units.selected ? c.noUnitsSelected : feedCopy.noUnits}</Notice>
      ) : (
        <div className="space-y-8">
          {feed.returnTrips.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-2xl">{feedCopy.returnTrips}</h2>
              <p className="text-sm text-muted-foreground">{feedCopy.returnTripsHelp}</p>
              {feed.returnTrips.map((group) => (
                <div key={group.vehicleId} className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {feedCopy.returnTripFor(labels.get(group.vehicleId) ?? '', group.startCity)}
                  </h3>
                  <ul className="space-y-2">
                    {group.recommendations.map((r, i) => (
                      <RecommendationCard key={r.loadId} recommendation={r} rank={i + 1} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-2xl">{feedCopy.recommended}</h2>
            <p className="text-sm text-muted-foreground">{feedCopy.recommendedHelp}</p>
            {feed.recommended.length === 0 ? (
              <p className="text-sm text-muted-foreground">{feedCopy.empty}</p>
            ) : (
              <ul className="space-y-2">
                {feed.recommended.map((r, i) => (
                  <RecommendationCard
                    key={r.loadId}
                    recommendation={r}
                    rank={i + 1}
                    unitLabel={labels.get(r.vehicleId)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <div className="mt-8">
        <Link href={paths.carrierLoads} className={buttonVariants({ variant: 'outline' })}>
          {feedCopy.searchAll}
        </Link>
      </div>
    </>
  );
}
