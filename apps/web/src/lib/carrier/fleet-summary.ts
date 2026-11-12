import {
  applicableRequirements,
  documentGate,
  documentGateText,
  requirementProgress,
  unitTravelGate,
  vehicleReadiness,
  type OwnerOperatorGate,
  type Requirement,
  type RequirementProgress,
  type SubmittedDocument,
  type Tables,
  type VehicleReadiness,
} from '@transport/shared';

// Pure part of the carrier's fleet reads (G10b): readiness, document progress
// and summaries of the rows fleet.ts loads. No I/O, so Vitest covers it.

export type FleetProgress = RequirementProgress<Requirement, SubmittedDocument>[];

/** The company, the active requirement catalog and the company's documents. */
export interface FleetContext {
  company: Pick<Tables<'companies'>, 'id' | 'type' | 'rfc' | 'legal_name'>;
  requirements: Requirement[];
  documents: SubmittedDocument[];
  /**
   * R4 (D13): what blocks the hombre-camión's units from his own documents,
   * as carrier_owner_operator_gate answers it (a Coordinador cannot read his
   * operator row). Absent or `isOwnerOperator: false` for a fleet.
   */
  ownerOperator?: OwnerOperatorGate;
}

/**
 * Why the documents keep a unit (no `operatorName`) or an operator from
 * travelling (R4, D45), or null when every required one is approved and
 * current. The same rule as assign_trip.
 */
export function ownerDocumentIssue(
  context: FleetContext,
  owner: { type: 'vehicle' | 'operator'; id: string },
  operatorName: string | null = null,
  now: Date = new Date(),
): string | null {
  const requirements = applicableRequirements(context.requirements, owner.type, context.company);
  return documentGateText(documentGate(requirements, context.documents, owner, now), operatorName);
}

/** Requirements of one unit or operator with the state of each (requirementProgress). */
export function ownerProgress(
  context: FleetContext,
  owner: { type: 'vehicle' | 'operator'; id: string },
  now: Date = new Date(),
): FleetProgress {
  const requirements = applicableRequirements(context.requirements, owner.type, context.company);
  return requirementProgress(requirements, context.documents, owner, now);
}

// ---------------------------------------------------------------------------
// Units (vehicles) and availability
// ---------------------------------------------------------------------------

export type Availability = Pick<
  Tables<'vehicle_availability'>,
  'vehicle_id' | 'available_from' | 'city' | 'state'
>;

export type VehicleRow = Pick<
  Tables<'vehicles'>,
  | 'id'
  | 'kind'
  | 'plate'
  | 'fleet_number'
  | 'model_year'
  | 'unit_type'
  | 'capacity_kg'
  | 'capacity_m3'
  | 'features'
  | 'axle_count'
  | 'business_unit_id'
  | 'current_operator_id'
>;

export interface VehicleSummary extends VehicleRow {
  availability: Availability | null;
  readiness: VehicleReadiness;
  /**
   * R4: why it cannot travel (its documents and, for a hombre-camión, his
   * own), or null. What availability and recommendations check.
   */
  documentIssue: string | null;
  /** R4: why its own documents block it, or null: what assign_trip checks of the unit. */
  unitDocumentIssue: string | null;
  /** R4: whether one of its own documents expired (the assignment's flag, apart from the owner's). */
  unitDocumentsExpired: boolean;
  /** Name of the business unit that runs it (G1a). */
  businessUnitName: string | null;
}

export type VehicleRead = VehicleRow & { business_unit: { name: string } | null };

/** Availability, readiness and business unit name of the given unit rows. */
export function summarizeVehicles(
  context: FleetContext,
  vehicles: VehicleRead[],
  availability: Availability[],
  pendingRelease: ReadonlySet<string>,
  now: Date = new Date(),
): VehicleSummary[] {
  const byVehicle = new Map(availability.map((a) => [a.vehicle_id, a]));
  const vehicleRequirements = applicableRequirements(
    context.requirements,
    'vehicle',
    context.company,
  );
  return vehicles.map(({ business_unit: unit, ...vehicle }) => {
    const current = byVehicle.get(vehicle.id) ?? null;
    const gate = unitTravelGate(
      {
        vehicleRequirements,
        documents: context.documents,
        vehicleId: vehicle.id,
        owner: context.ownerOperator ?? null,
      },
      now,
    );
    return {
      ...vehicle,
      businessUnitName: unit?.name ?? null,
      availability: current,
      documentIssue: gate.text,
      unitDocumentIssue: gate.unitText,
      unitDocumentsExpired: gate.unitExpired,
      readiness: vehicleReadiness(
        {
          expiredDocuments: gate.expired,
          missingDocuments: gate.notApproved,
          availableFrom: current?.available_from ?? null,
          pendingRelease: pendingRelease.has(vehicle.id),
        },
        now,
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type OperatorRow = Pick<
  Tables<'operators'>,
  | 'id'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'license_number'
  | 'license_type'
  | 'license_expires_on'
  | 'profile_id'
  | 'business_unit_id'
>;

export interface OperatorSummary extends OperatorRow {
  /** Pending (not accepted, revoked or expired) invitation, if any (D15). */
  invitation: Pick<Tables<'operator_invitations'>, 'id' | 'expires_at'> | null;
  /** Name of the business unit the operator drives for (G1a). */
  businessUnitName: string | null;
  /** R4: why its documents keep the operator from travelling, or null (ownerDocumentIssue). */
  documentIssue: string | null;
}

export type OperatorRead = OperatorRow & { business_unit: { name: string } | null };
export type PendingInvitation = Pick<
  Tables<'operator_invitations'>,
  'id' | 'operator_id' | 'expires_at'
>;

/** Business unit name, pending invitation and document issue of the given operator rows. */
export function summarizeOperators(
  context: FleetContext,
  operators: OperatorRead[],
  invitations: PendingInvitation[],
  now: Date = new Date(),
): OperatorSummary[] {
  const pending = new Map(invitations.map((i) => [i.operator_id, i]));
  return operators.map(({ business_unit: unit, ...operator }) => {
    const invitation = pending.get(operator.id);
    return {
      ...operator,
      businessUnitName: unit?.name ?? null,
      documentIssue: ownerDocumentIssue(
        context,
        { type: 'operator', id: operator.id },
        operator.full_name,
        now,
      ),
      invitation: invitation ? { id: invitation.id, expires_at: invitation.expires_at } : null,
    };
  });
}
