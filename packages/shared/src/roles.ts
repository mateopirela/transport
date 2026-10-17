// User roles after G1a (D19): the carrier company's staff are the Gerente
// (manager), who controls the whole company, and the Coordinador
// (coordinator), who operates only their business units. company_type and
// offer_side keep 'carrier': they are the company and the side of a
// negotiation, not the role.
import type { CompanyType, UserRole } from './enums';

/** Roles of a carrier company's staff (Gerente and Coordinador). */
export const CARRIER_STAFF_ROLES = [
  'manager',
  'coordinator',
] as const satisfies readonly UserRole[];
export type CarrierStaffRole = (typeof CARRIER_STAFF_ROLES)[number];

/** True for the Gerente and the Coordinador of a carrier company. */
export function isCarrierStaff(role: UserRole | null | undefined): role is CarrierStaffRole {
  return role === 'manager' || role === 'coordinator';
}

/** True for the Gerente, who controls the whole carrier company. */
export function isManager(role: UserRole | null | undefined): role is 'manager' {
  return role === 'manager';
}

/**
 * The role of a company's staff: shipper for a shipper company, manager for a
 * carrier company. Mirror of public.staff_role_for_company_type.
 */
export function staffRoleForCompanyType(type: CompanyType): 'shipper' | 'manager' {
  return type === 'shipper' ? 'shipper' : 'manager';
}
