import {
  carrierLoadsCopy,
  carrierWebCopy,
  managerCompanyCopy,
  unitLabel,
  vehicleReleaseCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { RecommendationCard } from '@/components/carrier/recommendation-card';
import { buttonVariants } from '@/components/ui/button';
import { loadSupervision, type UnitSupervision } from '@/lib/carrier/company';
import { carrierContext } from '@/lib/carrier/context';
import { carrierFeed, listCarrierUnits } from '@/lib/carrier/loads';
import { listPendingReleases } from '@/lib/carrier/release';
import { TRIP_FILTER_PARAMS } from '@/lib/carrier/trip-filters';
import { withParams } from '@/lib/pagination';
import { carrierUnitPath, paths } from '@/lib/routing';

const c = carrierWebCopy.home;
const feedCopy = carrierLoadsCopy.home;

export const metadata: Metadata = { title: c.title };

const s = managerCompanyCopy.supervision;

/** The Gerente's supervision (G4): active and unassigned trips per business unit. */
function Supervision({ rows }: { rows: UnitSupervision[] }) {
  return (
    <section className="mb-8 space-y-3">
      <h2 className="text-2xl">{s.title}</h2>
      <p className="text-sm text-muted-foreground">{s.description}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ unit, active, toAssign }) => (
          <li key={unit.id} className="space-y-1 rounded-xl border bg-card p-4">
            <p className="font-medium">{unit.name}</p>
            <p className="text-sm">{s.activeTrips(active)}</p>
            <p className="text-sm text-muted-foreground">{s.toAssign(toAssign)}</p>
            <Link
              href={withParams(
                paths.carrierTrips,
                {},
                { [TRIP_FILTER_PARAMS.businessUnit]: unit.id },
              )}
              className="text-sm text-accent hover:underline"
            >
              {s.viewTrips}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Carrier home (G10a): the units waiting for their release first (G5, D20),
 * then the recommendations of every unit of the selected business units
 * (B08), return trips first (B19). Units that are not ready (documents,
 * availability, pending release) simply get none. The Gerente also sees the
 * trips of each business unit (G4).
 */
export default async function CarrierHomePage() {
  const { supabase, viewer, companyId, units, isManager } = await carrierContext(paths.carrier);
  const supervised = units.operable.filter((unit) => units.ids.includes(unit.id));
  const [carrierUnits, pendingReleases, supervision] = await Promise.all([
    listCarrierUnits(supabase, companyId, units.ids),
    listPendingReleases(supabase, companyId, units.ids),
    isManager ? loadSupervision(supabase, supervised) : Promise.resolve([]),
  ]);
  const feed = carrierUnits.length > 0 ? await carrierFeed(supabase, carrierUnits) : null;
  const labels = new Map(carrierUnits.map((u) => [u.id, unitLabel(u)]));

  return (
    <>
      <PageHeading title={viewer.company?.legalName ?? c.title} description={c.description} />
      {pendingReleases.length > 0 && (
        <section className="mb-8 space-y-3 rounded-xl border border-destructive/40 bg-card p-4">
          <h2 className="text-xl">{vehicleReleaseCopy.home.title(pendingReleases.length)}</h2>
          <p className="text-sm text-muted-foreground">{vehicleReleaseCopy.home.help}</p>
          <ul className="divide-y">
            {pendingReleases.map((p) => (
              <li key={p.taskId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-sm font-medium">
                  {vehicleReleaseCopy.home.item(p.unit, p.route)}
                </span>
                <Link
                  href={carrierUnitPath(p.vehicleId)}
                  className={buttonVariants({ variant: 'accent', size: 'sm' })}
                >
                  {vehicleReleaseCopy.home.open}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {supervision.length > 0 && <Supervision rows={supervision} />}
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
