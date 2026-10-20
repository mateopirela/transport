import {
  adminCopy,
  auditChangedFields,
  formatDateTime,
  uuidField,
  verificationStatusLabels,
  type VerificationStatus,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { textLink } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table } from '@/components/ui/table';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = adminCopy.audit;
const col = adminCopy.columns;
const LIMIT = 200;

export const metadata: Metadata = { title: c.title };

function statusLabel(row: unknown): string | null {
  const status = (row as { status?: unknown } | null)?.status;
  return typeof status === 'string' && Object.hasOwn(verificationStatusLabels, status)
    ? verificationStatusLabels[status as VerificationStatus]
    : null;
}

/** "Estado: En revisión → Aprobado · Notas" from the old and new row. */
function describeChanges(oldData: unknown, newData: unknown): string {
  return auditChangedFields(oldData, newData)
    .map((field) => {
      const label = c.fields[field] ?? field;
      if (field !== 'status') return label;
      const before = statusLabel(oldData);
      const after = statusLabel(newData);
      return `${label}: ${[before, after].filter(Boolean).join(' → ')}`;
    })
    .join(' · ');
}

/** Read-only view of the immutable audit log (B03), optionally for one company. */
export default async function AdminAuditPage({ searchParams }: PageProps<'/admin/auditoria'>) {
  await requireAccess(paths.adminAudit);
  const { empresa } = await searchParams;
  const companyId =
    typeof empresa === 'string' && uuidField.safeParse(empresa).success ? empresa : null;

  const supabase = await createClient();
  let entries: {
    id: string;
    occurred_at: string;
    actor_id: string | null;
    action: string;
    table_name: string;
    company_id: string | null;
    old_data: unknown;
    new_data: unknown;
  }[] = [];
  const names = new Map<string, string>();
  let loadError = !supabase;
  if (supabase) {
    let query = supabase
      .from('audit_log')
      .select('id, occurred_at, actor_id, action, table_name, company_id, old_data, new_data')
      .order('occurred_at', { ascending: false })
      .limit(LIMIT);
    if (companyId) query = query.eq('company_id', companyId);
    const result = await query;
    loadError = result.error !== null;
    entries = result.data ?? [];

    const actorIds = [...new Set(entries.flatMap((e) => (e.actor_id ? [e.actor_id] : [])))];
    const companyIds = [
      ...new Set([
        ...(companyId ? [companyId] : []),
        ...entries.flatMap((e) => (e.company_id ? [e.company_id] : [])),
      ]),
    ];
    const [actors, companies] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', actorIds),
      supabase.from('companies').select('id, legal_name').in('id', companyIds),
    ]);
    // Names are cosmetic; a failed lookup falls back to the id.
    for (const a of actors.data ?? []) names.set(a.id, a.full_name ?? a.id);
    for (const company of companies.data ?? []) names.set(company.id, company.legal_name);
  }

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      {companyId && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-subhead">
          <span className="text-text-dim">{c.filtered}</span>
          <Pill tone="accent">{names.get(companyId) ?? companyId}</Pill>
          <Link
            href={paths.adminAudit}
            className={buttonVariants({ variant: 'plain', size: 'sm' })}
          >
            {c.clearFilter}
          </Link>
        </div>
      )}
      {loadError ? (
        <Notice tone="error">{adminCopy.errors.loadFailed}</Notice>
      ) : entries.length === 0 ? (
        <Empty title={c.empty} />
      ) : (
        <Table headers={[col.date, col.actor, col.action, col.record, col.company, col.changes]}>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="whitespace-nowrap text-text-dim tabular-nums">
                {formatDateTime(entry.occurred_at)}
              </td>
              <td className="font-semibold">
                {(entry.actor_id && names.get(entry.actor_id)) ?? c.unknownActor}
              </td>
              <td>{c.actions[entry.action] ?? entry.action}</td>
              <td>{c.tables[entry.table_name] ?? entry.table_name}</td>
              <td>
                {entry.company_id && (
                  <Link href={adminCompanyPath(entry.company_id)} className={textLink}>
                    {names.get(entry.company_id) ?? entry.company_id}
                  </Link>
                )}
              </td>
              <td className="text-footnote text-text-dim">
                {entry.action === 'update' && describeChanges(entry.old_data, entry.new_data)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
