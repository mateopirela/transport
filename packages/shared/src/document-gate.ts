// Trip document gate (R4, D45): a unit or an operator travels only with every
// required document of the catalog approved and current. Postgres enforces it
// (assert_vehicle_documents_ready, assert_operator_documents_ready, used by
// assign_trip, set_vehicle_availability, release_vehicle and match_pairs);
// these pure helpers say beforehand, in the fleet and the assignment form,
// what blocks whom, and translate the server's errors.
import { documentGateCopy as copy } from './copy/document-gate';
import type { DocumentOwnerType, Requirement, SubmittedDocument } from './verification';

type GateRequirement = Pick<
  Requirement,
  'id' | 'code' | 'name' | 'is_required' | 'requires_expiry'
>;
type GateDocument = Pick<
  SubmittedDocument,
  'requirement_id' | 'owner_type' | 'owner_id' | 'status' | 'expires_at' | 'archived_at'
>;

/** The required documents that keep an owner from travelling, split by why. */
export interface DocumentGate<R> {
  /** Its document expired (marked `expired`, or approved and past its date) with no current replacement. */
  expired: R[];
  /** Never approved: missing, in review or rejected. */
  notApproved: R[];
}

/**
 * What blocks one unit or operator. `requirements` must come from
 * applicableRequirements (is_required resolved for the company). Mirrors
 * vehicle_/operator_missing_requirements (a requirement with an expiry needs
 * an approved, unexpired document with a date) and their `_expired_` subset.
 */
export function documentGate<R extends GateRequirement>(
  requirements: readonly R[],
  documents: readonly GateDocument[],
  owner: { type: DocumentOwnerType; id: string },
  now: Date = new Date(),
): DocumentGate<R> {
  const active = documents.filter(
    (d) => d.archived_at === null && d.owner_type === owner.type && d.owner_id === owner.id,
  );
  const pastExpiry = (expiresAt: string | null) =>
    expiresAt !== null && Date.parse(expiresAt) <= now.getTime();
  const gate: DocumentGate<R> = { expired: [], notApproved: [] };
  for (const requirement of requirements) {
    if (!requirement.is_required) continue;
    const docs = active.filter((d) => d.requirement_id === requirement.id);
    const current = docs.some(
      (d) =>
        d.status === 'approved' &&
        !pastExpiry(d.expires_at) &&
        (!requirement.requires_expiry || d.expires_at !== null),
    );
    if (current) continue;
    const expired = docs.some(
      (d) => d.status === 'expired' || (d.status === 'approved' && pastExpiry(d.expires_at)),
    );
    (expired ? gate.expired : gate.notApproved).push(requirement);
  }
  return gate;
}

/**
 * The hombre-camión's own readiness (D13), as carrier_owner_operator_gate
 * answers it to the carrier staff: a Coordinador cannot read his operator
 * row by RLS, so the fleet never derives it from what it can read.
 */
export interface OwnerOperatorGate {
  isOwnerOperator: boolean;
  /** His active operator row's name; null when it is archived or missing. */
  operatorName: string | null;
  expired: { code: string; name: string }[];
  notApproved: { code: string; name: string }[];
}

function namedCodes(value: unknown): { code: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { code, name } = item as { code?: unknown; name?: unknown };
    return typeof code === 'string' && typeof name === 'string' ? [{ code, name }] : [];
  });
}

/** The JSON of carrier_owner_operator_gate, checked; anything else reads as a fleet. */
export function parseOwnerOperatorGate(value: unknown): OwnerOperatorGate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { isOwnerOperator: false, operatorName: null, expired: [], notApproved: [] };
  }
  const row = value as Record<string, unknown>;
  return {
    isOwnerOperator: row.isOwnerOperator === true,
    operatorName: typeof row.operatorName === 'string' ? row.operatorName : null,
    expired: namedCodes(row.expired),
    notApproved: namedCodes(row.notApproved),
  };
}

/** What keeps a unit from being made available or recommended. */
export interface UnitTravelGate {
  /** Some document (the unit's or the hombre-camión's) expired. */
  expired: boolean;
  /** Some document is missing, in review or rejected, or the hombre-camión has no operator row. */
  notApproved: boolean;
  /** Whether one of the unit's own documents expired (what assign_trip checks of the unit). */
  unitExpired: boolean;
  /** Why the unit's own documents block it, or null (what assign_trip checks of the unit). */
  unitText: string | null;
  /** Why it cannot travel at all, the hombre-camión's own documents included, or null. */
  text: string | null;
}

/**
 * The unit's own documents and, for an owner-operator company, the
 * hombre-camión's (he is its only driver): what set_vehicle_availability,
 * release_vehicle and match_pairs check (assert_vehicle_can_travel,
 * owner_operator_ready). Without an active own operator row the unit is
 * blocked too. `owner` null: a fleet, or not known.
 */
export function unitTravelGate<R extends GateRequirement>(
  input: {
    vehicleRequirements: readonly R[];
    documents: readonly GateDocument[];
    vehicleId: string;
    owner: OwnerOperatorGate | null;
  },
  now: Date = new Date(),
): UnitTravelGate {
  const unit = documentGate(
    input.vehicleRequirements,
    input.documents,
    { type: 'vehicle', id: input.vehicleId },
    now,
  );
  const unitText = documentGateText(unit);
  const result: UnitTravelGate = {
    expired: unit.expired.length > 0,
    notApproved: unit.notApproved.length > 0,
    unitExpired: unit.expired.length > 0,
    unitText,
    text: unitText,
  };
  const owner = input.owner;
  if (!owner?.isOwnerOperator) return result;
  let ownerText: string | null;
  if (owner.operatorName === null) {
    result.notApproved = true;
    ownerText = copy.ownerOperator.missing;
  } else {
    result.expired ||= owner.expired.length > 0;
    result.notApproved ||= owner.notApproved.length > 0;
    ownerText = documentGateText(owner, owner.operatorName);
  }
  result.text = [unitText, ownerText].filter((t) => t !== null).join(' ') || null;
  return result;
}

/** Whether nothing blocks the owner. */
export function documentGateOpen(gate: DocumentGate<unknown>): boolean {
  return gate.expired.length === 0 && gate.notApproved.length === 0;
}

/**
 * "A", "A y B", "A, B y C"; "e" before a word that starts with the sound "i"
 * ("Licencia e Identificación oficial"), as Spanish asks.
 */
export function joinNames(names: readonly string[]): string {
  const unique = [...new Set(names)];
  const last = unique.at(-1) ?? '';
  if (unique.length <= 1) return last;
  const and = /^(?:i|í|hi|hí)(?![aeoáéó])/iu.test(last) ? copy.andBeforeI : copy.and;
  return `${unique.slice(0, -1).join(', ')} ${and} ${last}`;
}

const LICENSE_CODE = 'federal_driver_license';

/** The sentences of a gate: expired documents first, as the server reports them. */
function gateSentences(
  expired: readonly { code: string; name: string }[],
  notApproved: readonly { code: string; name: string }[],
  operatorName: string | null,
): string[] {
  const sentences: string[] = [];
  if (expired.length > 0) {
    const names = joinNames(expired.map((r) => r.name));
    if (operatorName === null) sentences.push(copy.unit.expired(names));
    else if (expired.length === 1 && expired[0]?.code === LICENSE_CODE) {
      sentences.push(copy.operator.licenseExpired(operatorName));
    } else sentences.push(copy.operator.expired(names, operatorName));
  }
  if (notApproved.length > 0) {
    const names = joinNames(notApproved.map((r) => r.name));
    sentences.push(
      operatorName === null
        ? copy.unit.notApproved(names)
        : copy.operator.notApproved(names, operatorName),
    );
  }
  return sentences;
}

/**
 * Why a unit (no `operatorName`) or an operator cannot travel, in one line
 * ("Venció: Seguro vigente. Falta aprobar: Tarjeta de circulación."), or
 * null when it can.
 */
export function documentGateText(
  gate: DocumentGate<{ code: string; name: string }>,
  operatorName: string | null = null,
): string | null {
  const sentences = gateSentences(gate.expired, gate.notApproved, operatorName);
  return sentences.length > 0 ? sentences.join(' ') : null;
}

/** The Spanish name of a catalog code in an error message. */
export function requirementNameForCode(code: string): string {
  return Object.hasOwn(copy.requirementNames, code)
    ? (copy.requirementNames[code] ?? copy.otherRequirement)
    : copy.otherRequirement;
}

const CODES = '([a-z][a-z0-9_]*(?:, [a-z][a-z0-9_]*)*)';
const VEHICLE_ERROR = new RegExp(`^vehicle has (expired|missing) documents: ${CODES}$`, 'u');
const OPERATOR_ERROR = new RegExp(
  `^operator has (expired|missing) documents: ${CODES}: (.+)$`,
  'su',
);

const OWNER_OPERATOR_ERROR = 'owner operator not found';

/** Where a gate error happened: it decides what the message suggests next. */
export type DocumentGateErrorContext = 'assign' | 'availability';

/**
 * Spanish text of a gate error of assign_trip, set_vehicle_availability or
 * release_vehicle (55000, "vehicle has missing documents: <codes>",
 * "operator has expired documents: <codes>: <name>", "owner operator not
 * found"…), or null for any other
 * message. Only catalog codes are read: unknown ones become "un documento
 * obligatorio", so database text never reaches the user.
 */
export function documentGateErrorText(
  message: string,
  context: DocumentGateErrorContext,
): string | null {
  const named = (codes: string) =>
    codes.split(', ').map((code) => ({ code, name: requirementNameForCode(code) }));
  const vehicle = VEHICLE_ERROR.exec(message);
  if (vehicle) {
    const requirements = named(vehicle[2] ?? '');
    const sentences =
      vehicle[1] === 'expired'
        ? gateSentences(requirements, [], null)
        : gateSentences([], requirements, null);
    const next = context === 'assign' ? copy.errors.assignUnit : copy.errors.availability;
    return [...sentences, next].join(' ');
  }
  const operator = OPERATOR_ERROR.exec(message);
  if (operator) {
    const requirements = named(operator[2] ?? '');
    const name = (operator[3] ?? '').trim();
    const sentences =
      operator[1] === 'expired'
        ? gateSentences(requirements, [], name)
        : gateSentences([], requirements, name);
    const next = context === 'assign' ? copy.errors.assignOperator : copy.errors.availability;
    return [...sentences, next].join(' ');
  }
  if (message === OWNER_OPERATOR_ERROR) {
    const next = context === 'assign' ? copy.errors.assignUnit : copy.errors.availability;
    return [copy.ownerOperator.missing, next].join(' ');
  }
  return null;
}
