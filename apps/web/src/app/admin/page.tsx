import {
  adminCopy,
  adminOpsCopy,
  adminPanelCopy,
  companyTypeLabels,
  documentOwnerTypeLabels,
  formatCalendarDate,
  incidentKindLabels,
  pilotKpiTiles,
  shellCopy,
  todayInMexicoCity,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AttentionList, type AttentionRow } from '@/components/admin/attention-list';
import { PageSection } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { KpiGrid, KpiTile } from '@/components/ui/kpi-tile';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import {
  ATTENTION_TONES,
  brokeredAttention,
  freightAttention,
  orderAttention,
  paymentsToRegister,
  type AttentionKind,
} from '@/lib/admin/dashboard';
import { formatRoute } from '@/lib/admin/filters';
import { listAdminIncidents, loadPilotSummary } from '@/lib/admin/queries';
import { loadAdminBrokered } from '@/lib/brokered/queries';
import { loadAdminFreight } from '@/lib/freight/queries';
import { serverRoadFactor } from '@/lib/loads/queries';
import { adminBrokeredPath, adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import {
  loadPendingCompanies,
  loadPendingDocuments,
  loadQueueCounts,
} from '@/lib/verification/admin-queries';

const c = shellCopy.adminHome;
const h = adminPanelCopy.home;
const k = adminOpsCopy.kpis;

export const metadata: Metadata = { title: c.title };

/** How many rows "Requiere tu atención" shows; the rest are counted under it. */
const ATTENTION_LIMIT = 8;

/** A read the dashboard can do without: when it fails, its figure is left out. */
function optional<T>(read: Promise<T>): Promise<T | null> {
  return read.catch(() => null);
}

const route = (row: { origin_city: string; destination_city: string }) =>
  `${row.origin_city} → ${row.destination_city}`;

const freightFilter = (filtro: string) => `${paths.adminFreight}?filtro=${filtro}`;

/**
 * Admin home (docs/plan-fulmis.md §2 V5): a dashboard. The four indicators
 * that ask for the admin's hand (accounts and documents to verify, payments
 * to register, open incidents), each a link to its list; "Requiere tu
 * atención" with one action per row; and the pilot's indicators under it.
 * Every figure comes from the queries the panel already had.
 */
export default async function AdminHomePage() {
  await requireAccess(paths.admin);
  const supabase = await createClient();
  const [counts, companies, documents, ledger, incidents, brokered, summary] = supabase
    ? await Promise.all([
        optional(loadQueueCounts(supabase)),
        optional(loadPendingCompanies(supabase, 1)),
        optional(loadPendingDocuments(supabase, 1)),
        optional(loadAdminFreight(supabase)),
        optional(listAdminIncidents(supabase, { status: 'open', page: 1 })),
        optional(loadAdminBrokered(supabase)),
        optional(loadPilotSummary(supabase)),
      ])
    : [null, null, null, null, null, null, null];

  // A failed read leaves its figure out; the page says so instead of an all-clear.
  const partial = [counts, companies, documents, ledger, incidents, brokered].some(
    (read) => read === null,
  );
  const freight = ledger ? freightAttention(ledger) : null;
  const toBroker = brokered ? brokeredAttention(brokered) : null;
  const pendingDocuments = counts
    ? counts.documents.company + counts.documents.vehicle + counts.documents.operator
    : null;

  const items: (AttentionRow & { kind: AttentionKind })[] = [];
  const add = (kind: AttentionKind, row: Omit<AttentionRow, 'tone' | 'tag' | 'action'>) =>
    items.push({
      ...row,
      kind,
      tone: ATTENTION_TONES[kind],
      tag: h.tags[kind],
      action: h.actions[kind],
    });
  for (const row of freight?.review ?? []) {
    add('review', {
      key: `review-${row.trip_id}`,
      title: h.items.review(route(row)),
      detail: h.items.reviewDetail,
      href: freightFilter('revisar'),
    });
  }
  for (const row of freight?.quickPay ?? []) {
    add('quickPay', {
      key: `quick-${row.trip_id}`,
      title: h.items.quickPay(route(row)),
      detail: h.items.quickPayDetail(row.carrier_name),
      href: freightFilter('rapido'),
    });
  }
  for (const incident of incidents?.rows ?? []) {
    add('incident', {
      key: `incident-${incident.id}`,
      title: h.items.incident(
        incidentKindLabels[incident.kind],
        incident.trip?.load ? formatRoute(incident.trip.load) : '',
      ),
      detail: incident.description,
      href: paths.adminIncidents,
    });
  }
  for (const row of freight?.overdue ?? []) {
    add('overdue', {
      key: `overdue-${row.trip_id}`,
      title: h.items.overdue(route(row)),
      detail: row.client_due_on
        ? h.items.overdueDetail(row.shipper_name, formatCalendarDate(row.client_due_on))
        : row.shipper_name,
      href: freightFilter('vencidos'),
    });
  }
  for (const row of freight?.carrierPayable ?? []) {
    add('carrierPayment', {
      key: `carrier-${row.trip_id}`,
      title: h.items.carrierPayment(route(row)),
      detail: h.items.carrierPaymentDetail(row.carrier_name, row.client_status !== 'paid'),
      href: freightFilter('transportista'),
    });
  }
  for (const row of toBroker?.toQuote ?? []) {
    add('brokered', {
      key: `brokered-${row.load_id}`,
      title: h.items.brokered(route(row)),
      href: adminBrokeredPath(row.load_id),
    });
  }
  for (const row of toBroker?.withOffers ?? []) {
    add('brokeredOffers', {
      key: `offers-${row.load_id}`,
      title: h.items.brokeredOffers(route(row)),
      detail: adminPanelCopy.loadDetail.pendingOffers(row.pending_offers),
      href: adminBrokeredPath(row.load_id),
    });
  }
  for (const company of companies?.rows ?? []) {
    add('company', {
      key: `company-${company.id}`,
      title: h.items.company(company.legal_name),
      detail: h.items.companyDetail(
        companyTypeLabels[company.type],
        adminCopy.queue.missing(company.missing),
      ),
      href: adminCompanyPath(company.id),
    });
  }
  for (const doc of documents?.rows ?? []) {
    add('document', {
      key: `document-${doc.id}`,
      title: h.items.document(doc.requirementName, doc.ownerName),
      detail: `${documentOwnerTypeLabels[doc.ownerType]} · ${doc.companyName}`,
      href: `${adminCompanyPath(doc.companyId)}#doc-${doc.id}`,
    });
  }
  // The lists the dashboard reads are each one page: what is beyond it counts too.
  const beyond =
    Math.max(0, (companies?.total ?? 0) - (companies?.rows.length ?? 0)) +
    Math.max(0, (documents?.total ?? 0) - (documents?.rows.length ?? 0)) +
    Math.max(0, (incidents?.total ?? 0) - (incidents?.rows.length ?? 0));
  const { shown, hidden } = orderAttention(items, ATTENTION_LIMIT);
  const left = hidden + beyond;

  const kpis = summary ? pilotKpiTiles(summary, serverRoadFactor()) : null;
  const figure = (value: number | null) => value ?? '—';

  return (
    <>
      <PageHeader
        eyebrow={formatCalendarDate(todayInMexicoCity())}
        title={c.title}
        description={c.description}
        action={
          <Link href={paths.adminQueue} className={buttonVariants({ variant: 'primary' })}>
            {adminCopy.home.openQueue}
          </Link>
        }
      />
      <div className="space-y-10">
        <KpiGrid aria-label={k.title}>
          <KpiTile
            label={h.kpis.companies}
            value={figure(counts?.companies ?? null)}
            hint={counts ? h.kpis.companiesHint(counts.companies) : undefined}
            href={paths.adminQueue}
            attention={(counts?.companies ?? 0) > 0}
          />
          <KpiTile
            label={h.kpis.documents}
            value={figure(pendingDocuments)}
            hint={
              counts
                ? h.kpis.documentsHint(
                    counts.documents.company,
                    counts.documents.vehicle,
                    counts.documents.operator,
                  )
                : undefined
            }
            href={paths.adminQueue}
            attention={(pendingDocuments ?? 0) > 0}
          />
          <KpiTile
            label={h.kpis.payments}
            value={figure(freight ? paymentsToRegister(freight) : null)}
            hint={
              freight
                ? h.kpis.paymentsHint(freight.overdue.length, freight.carrierPayable.length)
                : undefined
            }
            href={paths.adminFreight}
            attention={freight ? paymentsToRegister(freight) > 0 : false}
          />
          <KpiTile
            label={h.kpis.incidents}
            value={figure(incidents?.total ?? null)}
            hint={incidents ? h.kpis.incidentsHint(incidents.total) : undefined}
            href={paths.adminIncidents}
            attention={(incidents?.total ?? 0) > 0}
          />
        </KpiGrid>

        <div className="space-y-3">
          {partial && <Notice tone="error">{h.partial}</Notice>}
          <AttentionList
            title={h.attention}
            count={h.attentionCount(shown.length + left)}
            rows={shown}
            more={left > 0 ? h.attentionMore(left) : undefined}
            empty={
              partial ? (
                <p className="text-footnote text-text-dim">{h.partial}</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-subhead font-semibold text-text">{h.attentionEmpty}</p>
                  <p className="text-footnote text-text-dim">{h.attentionEmptyBody}</p>
                </div>
              )
            }
          />
        </div>

        <PageSection title={k.title} description={k.description}>
          {kpis ? (
            <KpiGrid>
              {kpis.map((tile) => (
                <KpiTile key={tile.key} label={tile.label} value={tile.value} hint={tile.hint} />
              ))}
              {/* Blank cells close the last row, so the hairlines never show through. */}
              {Array.from({ length: (4 - (kpis.length % 4)) % 4 }, (_, i) => (
                <div key={`blank-${i}`} aria-hidden className="hidden bg-cell lg:block" />
              ))}
              {kpis.length % 2 === 1 && (
                <div aria-hidden className="hidden bg-cell sm:block lg:hidden" />
              )}
            </KpiGrid>
          ) : (
            <Notice tone="error">{k.unavailable}</Notice>
          )}
        </PageSection>
      </div>
    </>
  );
}
