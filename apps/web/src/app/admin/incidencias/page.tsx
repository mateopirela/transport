import {
  adminOpsCopy,
  adminPanelCopy,
  formatDateTime,
  incidentKindLabels,
  uiCopy,
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
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { formatRoute, parseIncidentFilters } from '@/lib/admin/filters';
import { ADMIN_PAGE_SIZE, adminContext, listAdminIncidents } from '@/lib/admin/queries';
import { withParams } from '@/lib/pagination';
import { adminLoadPath, paths } from '@/lib/routing';

const c = adminOpsCopy.incidents;
const col = adminPanelCopy.incidents.columns;
const l = adminPanelCopy.lists;

export const metadata: Metadata = { title: c.title };

const TABS: { status: IncidentStatus; label: string }[] = [
  { status: 'open', label: c.tabs.open },
  { status: 'resolved', label: c.tabs.resolved },
];

/**
 * Incidents of every trip in a table (B16, resolve_incident from B06): the
 * open ones, oldest first, each resolved from a dialog that asks for the
 * resolution and says what happens; the resolved ones with their resolution.
 */
export default async function AdminIncidentsPage({
  searchParams,
}: PageProps<'/admin/incidencias'>) {
  const supabase = await adminContext(paths.adminIncidents);
  const filters = parseIncidentFilters(await searchParams);
  const { rows, total } = await listAdminIncidents(supabase, filters);
  const estado = filters.status === 'open' ? undefined : filters.status;
  const open = filters.status === 'open';

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-6">
        <Segmented
          label={c.title}
          value={filters.status}
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
        <p className="text-footnote text-text-dim tabular-nums sm:ml-auto">
          {l.count(total, ...l.incidents)}
        </p>
      </div>

      {rows.length === 0 ? (
        total === 0 && <Empty title={open ? c.emptyOpen : c.emptyResolved} />
      ) : (
        <Table
          cards
          headers={[
            col.kind,
            col.trip,
            col.description,
            col.reported,
            open ? { label: uiCopy.actions, srOnly: true } : col.resolution,
          ]}
        >
          {rows.map((incident) => (
            <TableRow key={incident.id}>
              <TableCell primary className="whitespace-nowrap">
                {incidentKindLabels[incident.kind]}
              </TableCell>
              <TableCell label={col.trip} className="whitespace-nowrap">
                {incident.trip?.load && (
                  <Link href={adminLoadPath(incident.trip.load_id)} className={textLink}>
                    {formatRoute(incident.trip.load)}
                  </Link>
                )}
              </TableCell>
              <TableCell label={col.description} className="min-w-64 whitespace-pre-line">
                {incident.description}
              </TableCell>
              <TableCell label={col.reported} className="whitespace-nowrap">
                <span className="block tabular-nums">{formatDateTime(incident.occurred_at)}</span>
                <span className="block text-footnote text-text-dim">
                  {userRoleLabels[incident.reporter_role]}
                </span>
              </TableCell>
              {open ? (
                <TableCell action>
                  <ResolveIncidentForm incidentId={incident.id} />
                </TableCell>
              ) : (
                <TableCell label={col.resolution} className="min-w-56">
                  <span className="block whitespace-pre-line">{incident.resolution}</span>
                  {incident.resolved_at && (
                    <span className="block text-footnote text-text-dim">
                      {c.resolvedAt(formatDateTime(incident.resolved_at))}
                    </span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </Table>
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
