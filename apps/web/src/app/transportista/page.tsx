import {
  carrierLoadsCopy,
  carrierTripsCopy,
  carrierWebCopy,
  collectionsTotals,
  formatDate,
  formatMoney,
  managerCompanyCopy,
  toMexicoCityDate,
  unitLabel,
  vehicleReleaseCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  AttentionList,
  DashboardSection,
  sectionLink,
  type AttentionItem,
} from '@/components/carrier/dashboard';
import { RECOMMENDATION_LIST, RecommendationCard } from '@/components/carrier/recommendation-card';
import { Cell } from '@/components/ui/cell';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { KpiGrid, KpiTile } from '@/components/ui/kpi-tile';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { textLink } from '@/components/page-section';
import { loadSupervision, type UnitSupervision } from '@/lib/carrier/company';
import { carrierContext } from '@/lib/carrier/context';
import { fleetExpiringDocuments, negotiationsToAnswer } from '@/lib/carrier/dashboard';
import {
  EXPIRY_WINDOW_DAYS,
  firstOf,
  type ExpiringDocument,
} from '@/lib/carrier/dashboard-summary';
import { carrierFeed, listCarrierUnits } from '@/lib/carrier/loads';
import { listPendingReleases } from '@/lib/carrier/release';
import { TRIP_FILTER_PARAMS, TRIP_VIEW_PARAMS } from '@/lib/carrier/trip-filters';
import { listCarrierTrips, type CarrierTripRow } from '@/lib/carrier/trips';
import { loadCarrierFreight } from '@/lib/freight/queries';
import { withParams } from '@/lib/pagination';
import {
  carrierNegotiationPath,
  carrierOperatorPath,
  carrierTripPath,
  carrierUnitPath,
  paths,
} from '@/lib/routing';

const c = carrierWebCopy.home;
const d = carrierWebCopy.dashboard;
const feedCopy = carrierLoadsCopy.home;
const s = managerCompanyCopy.supervision;

/** Rows of each kind the attention list shows before linking to the rest. */
const ATTENTION_PER_KIND = 4;

/** The anchor of the expiring documents, where the indicator and its row lead. */
const EXPIRING_SECTION_ID = 'por-vencer';

export const metadata: Metadata = { title: c.title };

/** A trips list filtered to one tab. */
function tripsView(view: 'active' | 'to_assign'): string {
  return withParams(paths.carrierTrips, {}, { [TRIP_FILTER_PARAMS.view]: TRIP_VIEW_PARAMS[view] });
}

function tripRoute(trip: CarrierTripRow): string {
  return trip.load ? `${trip.load.origin_city} → ${trip.load.destination_city}` : '';
}

/** The Gerente's supervision (G4): active and unassigned trips per business unit, one row each. */
function Supervision({ rows }: { rows: UnitSupervision[] }) {
  return (
    <DashboardSection title={s.title} description={s.description}>
      <ul className="border bg-cell">
        {rows.map(({ unit, active, toAssign }) => (
          <li key={unit.id}>
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
    </DashboardSection>
  );
}

/** Every document about to expire, with the unit or operator whose screen uploads its renewal. */
function ExpiringDocuments({ documents }: { documents: readonly ExpiringDocument[] }) {
  const e = d.expiring;
  return (
    <DashboardSection
      id={EXPIRING_SECTION_ID}
      title={e.title}
      count={documents.length}
      description={e.description(EXPIRY_WINDOW_DAYS)}
    >
      <Table
        cards
        headers={[
          e.columns.document,
          e.columns.owner,
          e.columns.due,
          { label: d.attention.expiringAction, srOnly: true },
        ]}
      >
        {documents.map((doc) => (
          <TableRow key={doc.documentId}>
            <TableCell primary>{doc.requirementName}</TableCell>
            <TableCell label={e.columns.owner}>
              {doc.owner.label}
              <span className="block text-footnote text-text-dim">
                {doc.owner.type === 'vehicle' ? e.vehicle : e.operator}
              </span>
            </TableCell>
            <TableCell label={e.columns.due}>
              <Tag tone="pending">{d.attention.expiringDetail(doc.daysLeft)}</Tag>
              <span className="block text-meta text-text-dim">{formatDate(doc.expiresAt)}</span>
            </TableCell>
            <TableCell action>
              <Link
                href={
                  doc.owner.type === 'vehicle'
                    ? carrierUnitPath(doc.owner.id)
                    : carrierOperatorPath(doc.owner.id)
                }
                className={textLink}
              >
                {d.attention.expiringAction}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </Table>
    </DashboardSection>
  );
}

/** The trips on the road now, a few rows of the trips table. */
function ActiveTrips({ rows, total }: { rows: CarrierTripRow[]; total: number }) {
  const t = carrierWebCopy.trips;
  return (
    <DashboardSection
      title={d.activeTrips.title}
      count={total}
      action={
        total > 0 && (
          <Link href={tripsView('active')} className={sectionLink}>
            {d.activeTrips.all}
          </Link>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="text-subhead text-text-dim">{d.activeTrips.empty}</p>
      ) : (
        <Table
          cards
          headers={[
            t.columns.route,
            t.columns.assignment,
            t.columns.status,
            { label: t.open, srOnly: true },
          ]}
        >
          {rows.map((trip) => (
            <TableRow key={trip.id}>
              <TableCell primary>{tripRoute(trip)}</TableCell>
              <TableCell label={t.columns.assignment} className="text-text-dim">
                {trip.unitName && trip.operatorName
                  ? carrierTripsCopy.list.assignedTo(trip.unitName, trip.operatorName)
                  : ''}
              </TableCell>
              <TableCell label={t.columns.status}>
                <TripStatusBadge status={trip.status} />
              </TableCell>
              <TableCell action>
                <Link href={carrierTripPath(trip.id)} className={textLink}>
                  {t.open}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </DashboardSection>
  );
}

/**
 * Carrier home as a dashboard (G10a; docs/plan-fulmis.md §1.5, V4): four
 * indicators (counteroffers to answer, trips on the road, what Fulmis owes
 * and documents about to expire), "Requiere tu atención" with one action per
 * row (units to release, G5; counteroffers; trips to assign; documents), the
 * trips on the road, the Gerente's supervision per business unit (G4) and the
 * recommendations of every unit of the selected business units (B08), return
 * trips first (B19). Everything narrows to the business unit picker (D19).
 */
export default async function CarrierHomePage() {
  const { supabase, viewer, companyId, units, isManager } = await carrierContext(paths.carrier);
  const supervised = units.operable.filter((unit) => units.ids.includes(unit.id));
  const page = { businessUnitIds: units.ids, page: 1 };
  const [
    carrierUnits,
    pendingReleases,
    supervision,
    toAnswer,
    activeTrips,
    toAssign,
    freight,
    expiring,
  ] = await Promise.all([
    listCarrierUnits(supabase, companyId, units.ids),
    listPendingReleases(supabase, companyId, units.ids),
    isManager ? loadSupervision(supabase, supervised) : Promise.resolve([]),
    negotiationsToAnswer(supabase, companyId, units.ids),
    listCarrierTrips(supabase, companyId, { ...page, view: 'active' }),
    listCarrierTrips(supabase, companyId, { ...page, view: 'to_assign' }),
    // The indicator never takes the home down.
    loadCarrierFreight(supabase).catch(() => null),
    fleetExpiringDocuments(supabase, companyId, units.ids),
  ]);
  const feed = carrierUnits.length > 0 ? await carrierFeed(supabase, carrierUnits) : null;
  const labels = new Map(carrierUnits.map((u) => [u.id, unitLabel(u)]));

  // Cobranza's totals, narrowed like its screen to the selected business unit.
  const ledger = freight?.filter(
    (row) => !units.selected || row.business_unit_id === units.selected.id,
  );
  const totals = ledger
    ? collectionsTotals(
        ledger.map((row) => ({
          status: row.status,
          pendingCents: row.pending_cents,
          payments: row.payments,
        })),
        toMexicoCityDate(new Date().toISOString()),
      )
    : null;

  const answer = firstOf(toAnswer, ATTENTION_PER_KIND);
  const assign = firstOf(toAssign.rows, ATTENTION_PER_KIND);
  const assignMore = toAssign.total - assign.shown.length;
  const [firstDocument] = expiring;
  const attention: AttentionItem[] = [
    ...pendingReleases.map((p) => ({
      key: `release-${p.taskId}`,
      tag: { label: d.attention.tags.release, tone: 'problem' as const },
      title: vehicleReleaseCopy.home.item(p.unit, p.route),
      detail: vehicleReleaseCopy.home.help,
      action: { href: carrierUnitPath(p.vehicleId), label: vehicleReleaseCopy.home.open },
    })),
    ...answer.shown.map((n) => ({
      key: `respond-${n.negotiationId}`,
      tag: { label: d.attention.tags.respond, tone: 'attention' as const },
      title: n.route,
      detail: d.attention.respondDetail(formatMoney(n.amountCents)),
      action: { href: carrierNegotiationPath(n.negotiationId), label: d.attention.respondAction },
    })),
    ...assign.shown.map((trip) => ({
      key: `assign-${trip.id}`,
      tag: { label: d.attention.tags.assign, tone: 'pending' as const },
      title: tripRoute(trip),
      detail: trip.load
        ? d.attention.assignDetail(formatDate(trip.load.pickup_window_start))
        : undefined,
      action: { href: carrierTripPath(trip.id), label: d.attention.assignAction },
    })),
    // The documents are one row; the section below lists every one of them.
    ...(firstDocument
      ? [
          {
            key: 'expiring',
            tag: { label: d.attention.tags.expiring, tone: 'pending' as const },
            title: d.attention.expiringTitle(expiring.length),
            detail: d.attention.expiringFirst(
              firstDocument.requirementName,
              firstDocument.owner.label,
              d.attention.expiringDetail(firstDocument.daysLeft),
            ),
            action: { href: `#${EXPIRING_SECTION_ID}`, label: d.attention.expiringAction },
          },
        ]
      : []),
  ];
  const overflow = [
    ...(answer.more > 0
      ? [{ href: paths.carrierNegotiations, label: d.attention.moreRespond(answer.more) }]
      : []),
    ...(assignMore > 0
      ? [{ href: tripsView('to_assign'), label: d.attention.moreAssign(assignMore) }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={viewer.company?.legalName ?? c.title}
        description={d.description}
        action={
          <Link href={paths.carrierLoads} className={buttonVariants({ variant: 'primary' })}>
            {feedCopy.searchAll}
          </Link>
        }
      />
      <div className="space-y-12">
        <KpiGrid>
          <KpiTile
            label={d.kpis.respond}
            value={toAnswer.length}
            hint={d.kpis.respondHint(toAnswer.length)}
            href={paths.carrierNegotiations}
            attention={toAnswer.length > 0}
          />
          <KpiTile
            label={d.kpis.active}
            value={activeTrips.total}
            hint={d.kpis.activeHint(toAssign.total)}
            href={tripsView('active')}
          />
          <KpiTile
            label={d.kpis.receivable}
            value={totals ? <Money cents={totals.receivableCents} size="numeral" /> : '—'}
            hint={d.kpis.receivableHint(
              totals && totals.onHoldCents > 0 ? formatMoney(totals.onHoldCents) : null,
            )}
            href={paths.carrierCollections}
          />
          <KpiTile
            label={d.kpis.expiring}
            value={expiring.length}
            hint={d.kpis.expiringHint(EXPIRY_WINDOW_DAYS)}
            href={expiring.length > 0 ? `#${EXPIRING_SECTION_ID}` : paths.carrierUnits}
            attention={expiring.length > 0}
          />
        </KpiGrid>

        <DashboardSection
          title={d.attention.title}
          count={
            pendingReleases.length + toAnswer.length + toAssign.total + (firstDocument ? 1 : 0)
          }
        >
          {attention.length === 0 ? (
            <Empty title={d.attention.empty} description={d.attention.emptyHelp} />
          ) : (
            <AttentionList
              items={attention}
              footer={
                overflow.length > 0 &&
                overflow.map((link) => (
                  <Link key={link.href} href={link.href} className={sectionLink}>
                    {link.label}
                  </Link>
                ))
              }
            />
          )}
        </DashboardSection>

        {expiring.length > 0 && <ExpiringDocuments documents={expiring} />}

        <ActiveTrips rows={activeTrips.rows.slice(0, 5)} total={activeTrips.total} />

        {units.operable.length === 0 ? (
          <Notice tone="info">{carrierWebCopy.businessUnit.none}</Notice>
        ) : !feed ? (
          <Notice tone="info">{units.selected ? c.noUnitsSelected : feedCopy.noUnits}</Notice>
        ) : (
          <>
            {feed.returnTrips.length > 0 && (
              <DashboardSection title={feedCopy.returnTrips} description={feedCopy.returnTripsHelp}>
                <div className="space-y-6">
                  {feed.returnTrips.map((group) => (
                    <div key={group.vehicleId} className="space-y-2">
                      <h3 className="text-subhead font-semibold text-text">
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
              </DashboardSection>
            )}
            <DashboardSection title={feedCopy.recommended} description={feedCopy.recommendedHelp}>
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
            </DashboardSection>
          </>
        )}

        {supervision.length > 0 && <Supervision rows={supervision} />}
      </div>
    </>
  );
}
