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
import { PageHeading } from '@/components/app-shell';
import { Pager } from '@/components/pager';
import { formatRoute, parseIncidentFilters } from '@/lib/admin/filters';
import { ADMIN_PAGE_SIZE, adminContext, listAdminIncidents } from '@/lib/admin/queries';
import { withParams } from '@/lib/pagination';
import { adminLoadPath, paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

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
      <PageHeading title={c.title} description={c.description} />
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={withParams(
              paths.adminIncidents,
              {},
              {
                estado: tab.status === 'open' ? undefined : tab.status,
              },
            )}
            aria-current={tab.status === filters.status ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 hover:bg-muted',
              tab.status === filters.status && 'border-accent bg-accent/10 text-accent',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? (filters.status === 'open' ? c.emptyOpen : c.emptyResolved) : ''}
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((incident) => (
            <li key={incident.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{incidentKindLabels[incident.kind]}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(incident.occurred_at)} · {userRoleLabels[incident.reporter_role]}
                </p>
              </div>
              {incident.trip?.load && (
                <Link
                  href={adminLoadPath(incident.trip.load_id)}
                  className="text-sm text-accent hover:underline"
                >
                  {formatRoute(incident.trip.load)}
                </Link>
              )}
              <p className="text-sm whitespace-pre-line">{incident.description}</p>
              {incident.status === 'open' ? (
                <ResolveIncidentForm incidentId={incident.id} />
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="whitespace-pre-line">{incident.resolution}</p>
                  {incident.resolved_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
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
