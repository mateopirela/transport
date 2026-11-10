import { TERMS_VERSION, type UserRole, type VerificationStatus } from '@transport/shared';

import type { ProfileSnapshot } from './routing';

export interface ProfileDetails extends ProfileSnapshot {
  fullName: string | null;
  phone: string | null;
  companyName: string | null;
  companyStatusReason: string | null;
  /** A hombre-camión (D13): the Gerente also drives, so the app adds "Mi viaje". */
  isOwnerOperator: boolean;
}

/** Row returned by `profiles` with its company embedded (see PROFILE_SELECT). */
export interface ProfileRow {
  role: UserRole;
  company_id: string | null;
  full_name: string | null;
  phone: string | null;
  companies: {
    legal_name: string;
    status: VerificationStatus;
    status_reason: string | null;
    is_owner_operator: boolean;
  } | null;
  /** The acceptances of the current terms (filtered by PROFILE_TERMS_FILTER, I1). */
  terms_acceptances: { terms_version: string }[];
}

export const PROFILE_SELECT =
  'role, company_id, full_name, phone, companies(legal_name, status, status_reason, is_owner_operator), terms_acceptances(terms_version)' as const;

/** Keeps only the acceptance of the current terms in the embedded list (I1). */
export const PROFILE_TERMS_FILTER = ['terms_acceptances.terms_version', TERMS_VERSION] as const;

export function toProfileDetails(row: ProfileRow): ProfileDetails {
  // The company is null when it is not readable (RLS) even if company_id is set.
  const company = row.company_id ? row.companies : null;
  return {
    role: row.role,
    companyId: row.company_id,
    companyStatus: company?.status ?? null,
    fullName: row.full_name,
    phone: row.phone,
    companyName: company?.legal_name ?? null,
    companyStatusReason: company?.status_reason ?? null,
    isOwnerOperator: row.role === 'manager' && company?.is_owner_operator === true,
    termsAccepted: row.terms_acceptances.some((a) => a.terms_version === TERMS_VERSION),
  };
}
