import {
  carrierLoadsCopy,
  carrierWebCopy,
  managerCompanyCopy,
  unitLabel,
  vehicleReleaseCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { RECOMMENDATION_LIST, RecommendationCard } from '@/components/carrier/recommendation-card';
import { PageSection } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Cell } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { groupRow } from '@/components/ui/variants';
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

/** The Gerente's supervision (G4): active and unassigned trips per business unit, one row each. */
function Supervision({ rows }: { rows: UnitSupervision[] }) {
  return (
    <PageSection title={s.title} description={s.description}>
      <ul className="overflow-hidden rounded-2xl border bg-cell">
        {rows.map(({ unit, active, toAssign }) => (
          <li key={unit.id} className={groupRow}>
            <Cell
              href={withParams(
                paths.carrierTrips,
                {},
                { [TRIP_FILTER_PARAMS.businessUnit]: unit.id },
              )}
              title={unit.name}
              subtitle={`${s.activeTrips(active)} · ${s.toAssign(toAssign)}`}
              value={s.viewTrips}
            />
          </li>
        ))}
      </ul>
    </PageSection>
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
      <PageHeader
        title={viewer.company?.legalName ?? c.title}
        description={c.description}
        action={
          <Link href={paths.carrierLoads} className={buttonVariants({ variant: 'secondary' })}>
            {feedCopy.searchAll}
          </Link>
        }
      />
      <div className="space-y-12">
        {pendingReleases.length > 0 && (
          <PageSection
            title={vehicleReleaseCopy.home.title(pendingReleases.length)}
            description={vehicleReleaseCopy.home.help}
          >
            <ul className="overflow-hidden rounded-2xl border border-red/30 bg-cell">
              {pendingReleases.map((p) => (
                <li
                  key={p.taskId}
                  className={`${groupRow} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}
                >
                  <span className="text-body text-text">
                    {vehicleReleaseCopy.home.item(p.unit, p.route)}
                  </span>
                  <Link
                    href={carrierUnitPath(p.vehicleId)}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    {vehicleReleaseCopy.home.open}
                  </Link>
                </li>
              ))}
            </ul>
          </PageSection>
        )}
        {supervision.length > 0 && <Supervision rows={supervision} />}
        {units.operable.length === 0 ? (
          <Notice tone="info">{carrierWebCopy.businessUnit.none}</Notice>
        ) : !feed ? (
          <Notice tone="info">{units.selected ? c.noUnitsSelected : feedCopy.noUnits}</Notice>
        ) : (
          <>
            {feed.returnTrips.length > 0 && (
              <PageSection title={feedCopy.returnTrips} description={feedCopy.returnTripsHelp}>
                <div className="space-y-6">
                  {feed.returnTrips.map((group) => (
                    <div key={group.vehicleId}>
                      <h3 className="mb-1.5 px-4 text-label text-text-dim">
                        {feedCopy.returnTripFor(labels.get(group.vehicleId) ?? '', group.startCity)}
                      </h3>
                      <ul className={RECOMMENDATION_LIST}>
                        {group.recommendations.map((r, i) => (
                          <RecommendationCard key={r.loadId} recommendation={r} rank={i + 1} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </PageSection>
            )}
            <PageSection title={feedCopy.recommended} description={feedCopy.recommendedHelp}>
              {feed.recommended.length === 0 ? (
                <Empty title={feedCopy.empty} />
              ) : (
                <ul className={RECOMMENDATION_LIST}>
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
            </PageSection>
          </>
        )}
      </div>
    </>
  );
}
