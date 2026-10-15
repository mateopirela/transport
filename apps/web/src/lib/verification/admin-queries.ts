import 'server-only';

import type { DocumentOwnerType } from '@transport/shared';

import type { Supabase } from '../viewer';

/** Rows per queue page; the oldest first, so nothing waits forever. */
export const QUEUE_PAGE_SIZE = 50;

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Admin query failed: ${result.error.message}`);
  return result.data as T;
}

/** Counts for the admin home: companies and documents waiting for review. */
export async function loadQueueCounts(supabase: Supabase) {
  const pendingDocs = (ownerType: DocumentOwnerType) =>
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review')
      .eq('owner_type', ownerType)
      .is('archived_at', null);
  const [companies, company, vehicle, operator] = await Promise.all([
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review')
      .is('archived_at', null),
    pendingDocs('company'),
    pendingDocs('vehicle'),
    pendingDocs('operator'),
  ]);
  for (const r of [companies, company, vehicle, operator]) check(r);
  return {
    companies: companies.count ?? 0,
    documents: {
      company: company.count ?? 0,
      vehicle: vehicle.count ?? 0,
      operator: operator.count ?? 0,
    } satisfies Record<DocumentOwnerType, number>,
  };
}

/** Companies in review with how many required company documents they still miss. */
export async function loadPendingCompanies(supabase: Supabase, page: number) {
  const from = (page - 1) * QUEUE_PAGE_SIZE;
  const result = await supabase
    .from('companies')
    .select('id, legal_name, rfc, type, created_at', { count: 'exact' })
    .eq('status', 'pending_review')
    .is('archived_at', null)
    .order('created_at')
    .order('id')
    .range(from, from + QUEUE_PAGE_SIZE - 1);
  const companies = check(result);
  const rows = await Promise.all(
    companies.map(async (company) => {
      const missing = check(
        await supabase.rpc('company_missing_requirements', { p_company_id: company.id }),
      );
      return { ...company, missing: missing.length };
    }),
  );
  return { rows, total: result.count ?? rows.length };
}

/** Pending documents of companies, vehicles and operators, with a readable owner. */
export async function loadPendingDocuments(supabase: Supabase, page: number) {
  const from = (page - 1) * QUEUE_PAGE_SIZE;
  const result = await supabase
    .from('documents')
    .select(
      'id, owner_type, owner_id, created_at, company:companies(id, legal_name), requirement:document_requirements(name)',
      { count: 'exact' },
    )
    .eq('status', 'pending_review')
    .is('archived_at', null)
    .order('created_at')
    .order('id')
    .range(from, from + QUEUE_PAGE_SIZE - 1);
  const documents = check(result);
  const ids = (type: DocumentOwnerType) =>
    documents.filter((d) => d.owner_type === type).map((d) => d.owner_id);
  const [vehicles, operators] = await Promise.all([
    supabase.from('vehicles').select('id, plate').in('id', ids('vehicle')),
    supabase.from('operators').select('id, full_name').in('id', ids('operator')),
  ]);
  const names = new Map<string, string>([
    ...check(vehicles).map((v) => [v.id, v.plate] as const),
    ...check(operators).map((o) => [o.id, o.full_name] as const),
  ]);
  const rows = documents.map((d) => ({
    id: d.id,
    ownerType: d.owner_type,
    ownerName: d.owner_type === 'company' ? d.company.legal_name : (names.get(d.owner_id) ?? '—'),
    companyId: d.company.id,
    companyName: d.company.legal_name,
    requirementName: d.requirement.name,
    createdAt: d.created_at,
  }));
  return { rows, total: result.count ?? rows.length };
}
