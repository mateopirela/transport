import {
  adminOpsCopy,
  formatDateTime,
  incidentKindLabels,
  userRoleLabels,
  type IncidentStatus,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ResolveIncidentForm } from '@/components/admin/ops-forms';
import { textLink } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { groupRow } from '@/components/ui/variants';
import { formatRoute, parseIncidentFilters } from '@/lib/admin/filters';
import { ADMIN_PAGE_SIZE, adminContext, listAdminIncidents } from '@/lib/admin/queries';
import { withParams } from '@/lib/pagination';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.incidents;

export const metadata: Metadata = { title: c.title };

const TABS: { status: IncidentStatus; label: string }[] = [
  { status: 'open', label: c.tabs.open },
  { status: 'resolved', label: c.tabs.resolved },
];

/** Incidents of every trip: follow-up and resolution (B16, resolve_incident from B06). */
export default async function AdminIncidentsPage({
  searchParams,
}: PageProps<'/admin/incidencias'>) {
  const supabase = await adminContext(paths.adminIncidents);
  const filters = parseIncidentFilters(await searchParams);
  const { rows, total } = await listAdminIncidents(supabase, filters);
  const estado = filters.status === 'open' ? undefined : filters.status;

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <Segmented
        label={c.title}
        value={filters.status}
        className="mb-6"
        items={TABS.map((tab) => ({
          value: tab.status,
          label: tab.label,
          href: withParams(
            paths.adminIncidents,
            {},
            { estado: tab.status === 'open' ? undefined : tab.status },
          ),
        }))}
      />

      {rows.length === 0 ? (
        total === 0 && <Empty title={filters.status === 'open' ? c.emptyOpen : c.emptyResolved} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border bg-cell">
          {rows.map((incident) => (
            <li key={incident.id} className={`${groupRow} space-y-2 px-4 py-4`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-headline text-text">{incidentKindLabels[incident.kind]}</p>
                <p className="text-footnote text-text-dim tabular-nums">
                  {formatDateTime(incident.occurred_at)} · {userRoleLabels[incident.reporter_role]}
                </p>
              </div>
              {incident.trip?.load && (
                <Link
                  href={adminLoadPath(incident.trip.load_id)}
                  className={`inline-block text-subhead ${textLink}`}
                >
                  {formatRoute(incident.trip.load)}
                </Link>
              )}
              <p className="text-subhead whitespace-pre-line text-text">{incident.description}</p>
              {incident.status === 'open' ? (
                <div className="pt-1">
                  <ResolveIncidentForm incidentId={incident.id} />
                </div>
              ) : (
                <div className="rounded-md bg-surface-high px-3.5 py-3 text-subhead">
                  <p className="whitespace-pre-line text-text">{incident.resolution}</p>
                  {incident.resolved_at && (
                    <p className="mt-1 text-footnote text-text-dim">
                      {c.resolvedAt(formatDateTime(incident.resolved_at))}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <Pager
          page={filters.page}
          pageSize={ADMIN_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.adminIncidents, { estado }, { p: n })}
        />
      </div>
    </>
  );
}
