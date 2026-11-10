// Cargo insurance of the shipper (I1, D35-E1). The shipper proves it before
// every trip: the policy of the trip (trip document `cargo_insurance`) or an
// approved annual policy (company document `cargo_insurance_policy`) still
// valid at the pickup. Postgres decides (annual_cargo_policy,
// record_trip_event, trip_cargo_insurance); this is its pure mirror, tested
// against the same cases as 51_cargo_insurance.test.sql, and the state the
// screens show from the trip_cargo_insurance RPC.
import type { VerificationStatus } from './enums';

/** Code of the annual policy in document_requirements. */
export const CARGO_INSURANCE_POLICY_CODE = 'cargo_insurance_policy';

/** An annual policy document of the shipper, as the documents table keeps it. */
export interface AnnualPolicyDocument {
  status: VerificationStatus;
  expiresAt: string | null;
  archivedAt: string | null;
}

/** The trip dates that decide which policy covers it. */
export interface InsuredTripDates {
  /** When the pickup window opens (loads.pickup_window_start). */
  pickupWindowStart: string;
  /** When the trip left (trips.started_at), or null before. */
  startedAt: string | null;
}

/**
 * The instant an annual policy must still be valid at: the later of when the
 * pickup window opens and when the trip left (or now, before it leaves).
 */
export function cargoInsuranceReferenceInstant(trip: InsuredTripDates, now: Date): Date {
  const pickup = new Date(trip.pickupWindowStart);
  const at = trip.startedAt ? new Date(trip.startedAt) : now;
  return pickup.getTime() > at.getTime() ? pickup : at;
}

/**
 * Whether an annual policy covers the trip: approved (or approved and since
 * expired, for a trip that left before), current and still valid after the
 * reference instant (mirror of annual_cargo_policy).
 */
export function annualPolicyCoversTrip(
  policy: AnnualPolicyDocument,
  trip: InsuredTripDates,
  now: Date,
): boolean {
  if (policy.archivedAt !== null || policy.expiresAt === null) return false;
  if (policy.status !== 'approved' && policy.status !== 'expired') return false;
  return new Date(policy.expiresAt).getTime() > cargoInsuranceReferenceInstant(trip, now).getTime();
}

/** The covering annual policy with the latest expiry, or null. */
export function coveringAnnualPolicy<T extends AnnualPolicyDocument>(
  policies: readonly T[],
  trip: InsuredTripDates,
  now: Date,
): T | null {
  let best: T | null = null;
  for (const policy of policies) {
    if (!annualPolicyCoversTrip(policy, trip, now)) continue;
    if (best === null || Date.parse(policy.expiresAt ?? '') > Date.parse(best.expiresAt ?? '')) {
      best = policy;
    }
  }
  return best;
}

/** One row of the trip_cargo_insurance RPC. */
export interface TripCargoInsuranceRow {
  required: boolean;
  blocks_departure: boolean;
  trip_policy_at: string | null;
  annual_policy_expires_at: string | null;
  annual_policy_approved_at: string | null;
}

/** What the screens say about the insurance of a trip. */
export type CargoInsuranceState =
  | { kind: 'trip_policy'; uploadedAt: string }
  | { kind: 'annual_policy'; expiresAt: string }
  | { kind: 'missing'; blocksDeparture: boolean }
  | { kind: 'not_required' };

/**
 * The state of the insurance: the policy of the trip first (it is about this
 * trip), then the annual policy; missing when neither is there and the
 * catalog requires it.
 */
export function cargoInsuranceState(row: TripCargoInsuranceRow): CargoInsuranceState {
  if (row.trip_policy_at) return { kind: 'trip_policy', uploadedAt: row.trip_policy_at };
  if (row.annual_policy_expires_at) {
    return { kind: 'annual_policy', expiresAt: row.annual_policy_expires_at };
  }
  if (!row.required) return { kind: 'not_required' };
  return { kind: 'missing', blocksDeparture: row.blocks_departure };
}
