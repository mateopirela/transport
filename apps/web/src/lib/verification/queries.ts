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

const REQUIREMENT_COLUMNS =
  'id, code, name, description, owner_type, company_type, taxpayer_type, is_required, requires_expiry, sort_order, archived_at';
const DOCUMENT_COLUMNS =
  'id, requirement_id, owner_type, owner_id, status, review_notes, expires_at, created_at, archived_at, file_name';

export type Progress = RequirementProgress<Requirement, SubmittedDocument>[];

export interface OwnerVerification {
  ownerType: DocumentOwnerType;
  ownerId: string;
  label: string;
  progress: Progress;
}

export interface CompanyVerification {
  company: Tables<'companies'>;
  /** The company's own documents first, then each vehicle and operator. */
  owners: OwnerVerification[];
}

/**
 * Loads a company with the state of every applicable requirement for the
 * company and (for carriers) its active vehicles and operators. Everything
 * goes through RLS: a member only sees their own company, an admin any.
 */
export async function loadCompanyVerification(
  supabase: Supabase,
  companyId: string,
): Promise<CompanyVerification | null> {
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();
  if (!company) return null;

  const isCarrier = company.type === 'carrier';
  const [requirements, documents, vehicles, operators] = await Promise.all([
    supabase.from('document_requirements').select(REQUIREMENT_COLUMNS).is('archived_at', null),
    supabase
      .from('documents')
      .select(DOCUMENT_COLUMNS)
      .eq('company_id', companyId)
      .is('archived_at', null),
    isCarrier
      ? supabase
          .from('vehicles')
          .select('id, plate, fleet_number')
          .eq('company_id', companyId)
          .is('archived_at', null)
          .order('plate')
      : Promise.resolve({ data: [] }),
    isCarrier
      ? supabase
          .from('operators')
          .select('id, full_name')
          .eq('company_id', companyId)
          .is('archived_at', null)
          .order('full_name')
      : Promise.resolve({ data: [] }),
  ]);
  for (const result of [requirements, documents]) {
    if (result.error) throw new Error(`Could not load verification data: ${result.error.message}`);
  }
  const catalog = requirements.data ?? [];
  const docs = documents.data ?? [];

  const owner = (ownerType: DocumentOwnerType, ownerId: string, label: string) => ({
    ownerType,
    ownerId,
    label,
    progress: requirementProgress(applicableRequirements(catalog, ownerType, company), docs, {
      type: ownerType,
      id: ownerId,
    }),
  });

  return {
    company,
    owners: [
      owner('company', company.id, company.legal_name),
      ...(vehicles.data ?? []).map((v) =>
        owner('vehicle', v.id, v.fleet_number ? `${v.plate} · ${v.fleet_number}` : v.plate),
      ),
      ...(operators.data ?? []).map((o) => owner('operator', o.id, o.full_name)),
    ],
  };
}
