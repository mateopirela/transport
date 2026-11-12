import {
  clientHomeCopy,
  formatMoney,
  freightCopy,
  loadsCopy,
  shellCopy,
  tripProgressCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AttentionList } from '@/components/client/attention-list';
import { LoadsTable } from '@/components/client/loads-table';
import { Panel, panelLink } from '@/components/client/panel';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { ValueRow } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { KpiGrid, KpiTile } from '@/components/ui/kpi-tile';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Steps } from '@/components/ui/steps';
import { ATTENTION_SHOWN, loadClientDashboard } from '@/lib/client/dashboard';
import { tripProgress } from '@/lib/client/trip-progress';
import { shipperContext } from '@/lib/loads/queries';
import { paths, tripPath } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = clientHomeCopy;

export const metadata: Metadata = { title: shellCopy.shipperHome.title };

/**
 * The client's start (docs/plan-fulmis.md §1.5, V3): a dashboard. The four
 * indicators, what waits for the client (one action per row), the alive loads
 * as a table, the trip on the road with its steps and the portfolio. The one
 * filled primary is "Publicar una carga", in the header.
 */
export default async function ShipperHomePage() {
  const viewer = await requireAccess(paths.shipper);
  const { supabase, companyId } = await shipperContext(paths.shipper);
  const data = await loadClientDashboard(supabase, companyId);
  const { kpis, totals, currentTrip } = data;
  const attention = data.attention.slice(0, ATTENTION_SHOWN);

  return (
    <>
      <PageHeader
        title={c.title}
        description={viewer.company?.legalName}
        action={
          <Link href={paths.newLoad} className={buttonVariants()}>
            {loadsCopy.home.cta}
          </Link>
        }
      />

      <KpiGrid aria-label={c.summary} className="mb-8">
        <KpiTile
          label={c.kpis.offers}
          value={kpis.offers}
          hint={c.kpis.offersHint(kpis.offerLoads)}
          href={`${paths.shipperLoads}?estado=negotiating`}
          attention={kpis.offers > 0}
        />
        <KpiTile
          label={c.kpis.published}
          value={kpis.published}
          hint={c.kpis.publishedHint(kpis.published, kpis.waiting)}
          href={paths.shipperLoads}
        />
        <KpiTile
          label={c.kpis.trips}
          value={kpis.trips}
          hint={c.kpis.tripsHint(kpis.toConfirm)}
          href={paths.shipperTrips}
        />
        <KpiTile
          label={c.kpis.balance}
          value={formatMoney(totals.balanceCents)}
          hint={
            totals.overdueCents > 0
              ? c.kpis.balanceOverdue(formatMoney(totals.overdueCents))
              : c.kpis.balanceClear
          }
          href={paths.shipperPortfolio}
        />
      </KpiGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0 space-y-6">
          <Panel
            title={c.attention.title}
            count={
              data.attention.length > 0 && <Pill tone="attention">{data.attention.length}</Pill>
            }
          >
            <AttentionList items={attention} hidden={data.attention.length - attention.length} />
          </Panel>

          <Panel
            title={c.activeLoads.title}
            action={
              data.activeLoadsTotal > 0 && (
                <Link href={paths.shipperLoads} className={panelLink}>
                  {c.activeLoads.seeAll}
                </Link>
              )
            }
          >
            {data.activeLoads.length === 0 ? (
              <Empty
                variant="plain"
                title={c.activeLoads.empty}
                description={c.activeLoads.emptyHelp}
                className="py-10"
              />
            ) : (
              <LoadsTable
                rows={data.activeLoads}
                className="border-0 max-sm:px-4 max-sm:pt-4 max-sm:pb-4"
              />
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel
            title={c.currentTrip.title}
            action={
              <Link
                href={currentTrip ? tripPath(currentTrip.id) : paths.shipperTrips}
                className={panelLink}
              >
                {currentTrip ? c.currentTrip.open : c.currentTrip.seeAll}
              </Link>
            }
          >
            {currentTrip ? (
              <div className="space-y-5 px-5 py-4">
                <div className="space-y-2">
                  <TripStatusBadge status={currentTrip.status} />
                  <p className="text-title3 text-text">
                    {currentTrip.load
                      ? `${currentTrip.load.origin_city} → ${currentTrip.load.destination_city}`
                      : ''}
                  </p>
                  {currentTrip.parties && (
                    <p className="text-footnote text-text-dim">{currentTrip.parties.carrierName}</p>
                  )}
                </div>
                <Steps label={tripProgressCopy.label} steps={tripProgress(currentTrip.status)} />
              </div>
            ) : (
              <Empty
                variant="plain"
                title={c.currentTrip.none}
                description={c.currentTrip.noneHelp}
                className="py-10"
              />
            )}
          </Panel>

          <Panel
            title={c.portfolio.title}
            action={
              <Link href={paths.shipperPortfolio} className={panelLink}>
                {c.portfolio.open}
              </Link>
            }
          >
            <ValueRow label={freightCopy.portfolio.overdue}>
              <Money
                cents={totals.overdueCents}
                className={totals.overdueCents > 0 ? 'text-red-text' : undefined}
              />
            </ValueRow>
            <ValueRow label={freightCopy.portfolio.upcoming}>
              <Money cents={totals.upcomingCents} />
            </ValueRow>
          </Panel>
        </div>
      </div>
    </>
  );
}
