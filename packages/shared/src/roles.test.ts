import { describe, expect, it } from 'vitest';

import { USER_ROLES } from './enums';
import { CARRIER_STAFF_ROLES, isCarrierStaff, isManager, staffRoleForCompanyType } from './roles';

describe('roles', () => {
  it('has the manager and coordinator roles, and no carrier role', () => {
    expect(USER_ROLES).toEqual(['shipper', 'manager', 'coordinator', 'operator', 'admin']);
    expect(CARRIER_STAFF_ROLES).toEqual(['manager', 'coordinator']);
  });

  it('isCarrierStaff is true only for the manager and the coordinator', () => {
    expect(USER_ROLES.filter((role) => isCarrierStaff(role))).toEqual(['manager', 'coordinator']);
    expect(isCarrierStaff(null)).toBe(false);
    expect(isCarrierStaff(undefined)).toBe(false);
  });

  it('isManager is true only for the manager', () => {
    expect(USER_ROLES.filter((role) => isManager(role))).toEqual(['manager']);
    expect(isManager(null)).toBe(false);
  });

  it('maps a company type to the role of its staff', () => {
    expect(staffRoleForCompanyType('shipper')).toBe('shipper');
    expect(staffRoleForCompanyType('carrier')).toBe('manager');
  });
});
