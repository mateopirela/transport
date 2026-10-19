import 'server-only';

import {
  applicableRequirements,
  requirementProgress,
  type DocumentOwnerType,
  type Requirement,
  type RequirementProgress,
  type SubmittedDocument,
  type Tables,
} from '@transport/shared';

import type { Supabase } from '../viewer';
import { selectAll } from './paging';

const REQUIREMENT_COLUMNS =
  'id, code, name, description, owner_type, company_type, taxpayer_type, is_required, optional_for, requires_expiry, sort_order, archived_at';
const DOCUMENT_COLUMNS =
  'id, requirement_id, owner_type, owner_id, status, review_notes, expires_at, created_at, archived_at, file_name';

export type Progress = RequirementProgress<Requirement, SubmittedDocument>[];

export interface OwnerVerification {
  ownerType: DocumentOwnerType;
  ownerId: string;
  label: string;
  progress: Progress;
}

/** A pending document that no current requirement or active owner shows. */
export interface UnlistedDocument {
  document: SubmittedDocument;
  requirementName: string;
  ownerType: DocumentOwnerType;
  ownerLabel: string;
  requiresExpiry: boolean;
}

export interface CompanyVerification {
  company: Tables<'companies'>;
  /** The company's own documents first, then each active vehicle and operator. */
  owners: OwnerVerification[];
  /**
   * Pending documents whose requirement or owner was archived (or no longer
   * applies). They stay in the review queue, so the admin can still decide.
   */
  unlisted: UnlistedDocument[];
}

/**
 * Loads a company with the state of every applicable requirement for the
 * company and (for carriers) its active vehicles and operators. Everything
 * goes through RLS: a member only sees their own company, an admin any.
 * Query errors throw (error boundary) instead of looking like missing data.
 */
export async function loadCompanyVerification(
  supabase: Supabase,
  companyId: string,
): Promise<CompanyVerification | null> {
  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Could not load company: ${error.message}`);
  if (!company) return null;

  const isCarrier = company.type === 'carrier';
  const [catalog, docs, vehicles, operators] = await Promise.all([
    // Archived entries too: they name pending documents of retired requirements.
    selectAll((from, to) =>
      supabase
        .from('document_requirements')
        .select(REQUIREMENT_COLUMNS)
        .order('id')
        .range(from, to),
    ),
    selectAll((from, to) =>
      supabase
        .from('documents')
        .select(DOCUMENT_COLUMNS)
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('id')
        .range(from, to),
    ),
    isCarrier
      ? selectAll((from, to) =>
          supabase
            .from('vehicles')
            .select('id, plate, fleet_number, archived_at')
            .eq('company_id', companyId)
            .order('id')
            .range(from, to),
        )
      : [],
    isCarrier
      ? selectAll((from, to) =>
          supabase
            .from('operators')
            .select('id, full_name, archived_at')
            .eq('company_id', companyId)
            .order('id')
            .range(from, to),
        )
      : [],
  ]);

  const labels = new Map<string, string>([
    [company.id, company.legal_name],
    ...vehicles.map(
      (v) => [v.id, v.fleet_number ? `${v.plate} · ${v.fleet_number}` : v.plate] as const,
    ),
    ...operators.map((o) => [o.id, o.full_name] as const),
  ]);
  const owner = (ownerType: DocumentOwnerType, ownerId: string): OwnerVerification => ({
    ownerType,
    ownerId,
    label: labels.get(ownerId) ?? ownerId,
    progress: requirementProgress(applicableRequirements(catalog, ownerType, company), docs, {
      type: ownerType,
      id: ownerId,
    }),
  });
  const byLabel = (a: { id: string }, b: { id: string }) =>
    (labels.get(a.id) ?? '').localeCompare(labels.get(b.id) ?? '', 'es');

  const owners = [
    owner('company', company.id),
    ...vehicles
      .filter((v) => v.archived_at === null)
      .sort(byLabel)
      .map((v) => owner('vehicle', v.id)),
    ...operators
      .filter((o) => o.archived_at === null)
      .sort(byLabel)
      .map((o) => owner('operator', o.id)),
  ];

  const listed = new Set(
    owners.flatMap((o) => o.progress.flatMap((p) => (p.document ? [p.document.id] : []))),
  );
  const requirements = new Map(catalog.map((r) => [r.id, r]));
  const unlisted = docs
    .filter((d) => d.status === 'pending_review' && !listed.has(d.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((document) => ({
      document,
      requirementName: requirements.get(document.requirement_id)?.name ?? '—',
      ownerType: document.owner_type,
      ownerLabel: labels.get(document.owner_id) ?? '—',
      requiresExpiry: requirements.get(document.requirement_id)?.requires_expiry ?? false,
    }));

  return { company, owners, unlisted };
}
