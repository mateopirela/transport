// "Mi empresa" of the Gerente (G4, D19): pure helpers shared by the app and
// the web. The rules themselves live in Postgres (…_manager_company.sql);
// these only group what the screens list and map the RPC errors to copy.
import { managerCompanyErrorCopy as e } from './copy/manager-company';
import type { Database } from './db';

type InvitationKind = Database['public']['Enums']['invitation_kind'];

export interface BusinessUnitRef {
  id: string;
  name: string;
}

export interface BusinessUnitGroup<T> {
  /** Null for the rows whose business unit is not in the list (e.g. archived). */
  unit: BusinessUnitRef | null;
  items: T[];
}

/**
 * The rows of each business unit, by unit name (Spanish collation), every
 * unit listed even when empty. Rows of a unit not in the list go last, in a
 * group without unit. The order of the rows inside a group is kept.
 */
export function groupByBusinessUnit<T>(
  units: readonly BusinessUnitRef[],
  items: readonly T[],
  unitOf: (item: T) => string | null,
): BusinessUnitGroup<T>[] {
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const groups = new Map<string, BusinessUnitGroup<T>>(
    sorted.map((unit) => [unit.id, { unit, items: [] }]),
  );
  const orphans: T[] = [];
  for (const item of items) {
    const id = unitOf(item);
    const group = id ? groups.get(id) : undefined;
    if (group) group.items.push(item);
    else orphans.push(item);
  }
  const result = [...groups.values()];
  if (orphans.length > 0) result.push({ unit: null, items: orphans });
  return result;
}

export interface InvitationSummary {
  id: string;
  kind: InvitationKind;
  business_unit_ids: string[];
  operator_id: string | null;
  invitee_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

/** Invitations that can still be used (not accepted, revoked or expired), soonest to expire first. */
export function pendingInvitations<T extends InvitationSummary>(
  invitations: readonly T[],
  now: Date,
): T[] {
  return invitations
    .filter(
      (i) =>
        i.accepted_at === null && i.revoked_at === null && Date.parse(i.expires_at) > now.getTime(),
    )
    .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
}

/** Names of the business units of an invitation, in the order of `units`; unknown ids are skipped. */
export function businessUnitNames(
  ids: readonly string[],
  units: readonly BusinessUnitRef[],
): string[] {
  return units.filter((unit) => ids.includes(unit.id)).map((unit) => unit.name);
}

/**
 * Errors of the "Mi empresa" RPCs and of the invitation RPCs they use, by a
 * fragment of their fixed English message. Only known ones are mapped, so
 * database text never reaches the user.
 */
const MANAGER_COMPANY_ERRORS: readonly (readonly [RegExp, string])[] = [
  [/only the manager can manage the company|only the manager invites coordinators/u, e.managerOnly],
  [/business unit name must be/u, e.nameLength],
  [/business_units_company_name_key/u, e.nameTaken],
  [/cannot archive the only business unit/u, e.onlyBusinessUnit],
  [/business unit has active units or operators/u, e.businessUnitNotEmpty],
  [/business unit has open negotiations or trips/u, e.businessUnitOpenWork],
  [/business unit is archived/u, e.businessUnitArchived],
  [/business unit not found|the business unit must be the operator's/u, e.businessUnitNotFound],
  [
    /at least one business unit is required|exactly one business unit is required/u,
    e.unitsRequired,
  ],
  [/coordinator not found/u, e.coordinatorNotFound],
  [/cannot remove yourself/u, e.cannotRemoveSelf],
  [/only coordinators can be removed/u, e.onlyCoordinators],
  [/cannot move: it is committed to a trip/u, e.committed],
  [/^(vehicle|operator) not found$/u, e.notFound],
  [/^(vehicle|operator) is archived$/u, e.archived],
  [/operator has no account/u, e.operatorHasNoAccount],
];

/** Spanish text for a known error of a "Mi empresa" write, or null when unknown. */
export function managerCompanyErrorText(message: string): string | null {
  for (const [pattern, text] of MANAGER_COMPANY_ERRORS) if (pattern.test(message)) return text;
  return null;
}
