// Pure state machines (plan §1.1). The database enforces the same rules inside
// the RPCs that perform each transition; this module lets the apps show only the
// actions that are allowed and gives the SQL a reference to test against.
import {
  LOAD_STATUSES,
  OFFER_STATUSES,
  TRIP_STATUSES,
  VERIFICATION_STATUSES,
  type LoadStatus,
  type OfferStatus,
  type TripStatus,
  type UserRole,
  type VerificationStatus,
} from './enums';

/** Who performs a transition: a signed-in role, or the backend (RPC side effects, crons). */
export type Actor = UserRole | 'system';

interface StatusByEntity {
  load: LoadStatus;
  offer: OfferStatus;
  trip: TripStatus;
  document: VerificationStatus;
  company: VerificationStatus;
}
export type Entity = keyof StatusByEntity;
export type StatusOf<E extends Entity> = StatusByEntity[E];

interface Rule<S extends string> {
  from: readonly S[];
  to: S;
  by: readonly Actor[];
}

const LOAD_RULES: readonly Rule<LoadStatus>[] = [
  { from: ['draft'], to: 'published', by: ['shipper'] },
  // First offer opens the negotiation; the load returns to `published` when
  // every negotiation ends without agreement.
  { from: ['published'], to: 'negotiating', by: ['system'] },
  { from: ['negotiating'], to: 'published', by: ['system'] },
  // `accept_offer` contracts the load as a side effect.
  { from: ['negotiating'], to: 'contracted', by: ['system'] },
  // Driven by the trip: departure starts it, confirmed delivery completes it.
  { from: ['contracted'], to: 'in_progress', by: ['system'] },
  { from: ['in_progress'], to: 'completed', by: ['system'] },
  { from: ['draft', 'published', 'negotiating'], to: 'cancelled', by: ['shipper', 'admin'] },
  // After contracting, cancelling the trip cancels the load (`system`).
  { from: ['contracted', 'in_progress'], to: 'cancelled', by: ['admin', 'system'] },
  { from: ['published', 'negotiating'], to: 'expired', by: ['system'] },
];

// Who may accept, reject or counter depends on the offer's side (only the
// counterparty may); that check needs the offer row and lives in the RPC.
const OFFER_RULES: readonly Rule<OfferStatus>[] = [
  { from: ['pending'], to: 'accepted', by: ['shipper', 'carrier'] },
  // `system`: accepting one offer rejects the other pending offers of the load.
  { from: ['pending'], to: 'rejected', by: ['shipper', 'carrier', 'system'] },
  { from: ['pending'], to: 'countered', by: ['shipper', 'carrier'] },
  { from: ['pending'], to: 'withdrawn', by: ['shipper', 'carrier'] },
  { from: ['pending'], to: 'expired', by: ['system'] },
];

const TRIP_RULES: readonly Rule<TripStatus>[] = [
  // Admin may assign manually (producto §3, Admin).
  { from: ['pending_assignment'], to: 'assigned', by: ['carrier', 'admin'] },
  { from: ['assigned'], to: 'en_route_to_pickup', by: ['operator'] },
  { from: ['en_route_to_pickup'], to: 'at_pickup', by: ['operator'] },
  { from: ['at_pickup'], to: 'loading', by: ['operator'] },
  { from: ['loading'], to: 'in_transit', by: ['operator'] },
  { from: ['in_transit'], to: 'at_delivery', by: ['operator'] },
  { from: ['at_delivery'], to: 'unloading', by: ['operator'] },
  { from: ['unloading'], to: 'delivered', by: ['operator'] },
  // The shipper confirms delivery; admin can close a disputed trip.
  { from: ['delivered'], to: 'closed', by: ['shipper', 'admin'] },
  // Cancellation always carries a reason (validated by the RPC). Once the cargo
  // is on board only the admin may cancel.
  {
    from: ['pending_assignment', 'assigned', 'en_route_to_pickup', 'at_pickup'],
    to: 'cancelled',
    by: ['shipper', 'carrier', 'admin'],
  },
  { from: ['loading', 'in_transit', 'at_delivery', 'unloading'], to: 'cancelled', by: ['admin'] },
];

/** Builds verification rules; `owners` are the roles that submit or resubmit. */
function verificationRules(owners: readonly Actor[]): readonly Rule<VerificationStatus>[] {
  return [
    { from: ['pending_review'], to: 'approved', by: ['admin'] },
    { from: ['pending_review'], to: 'rejected', by: ['admin'] },
    { from: ['approved'], to: 'expired', by: ['system'] },
    { from: ['approved', 'expired'], to: 'suspended', by: ['admin'] },
    // Reactivation after a suspension (producto §3, Admin: suspend and reactivate).
    { from: ['suspended'], to: 'approved', by: ['admin'] },
    // Resubmitting after a rejection or expiry sends it back to review.
    { from: ['rejected', 'expired'], to: 'pending_review', by: owners },
  ];
}

// Operator documents (license) may be uploaded by the operator or their carrier.
const DOCUMENT_RULES = verificationRules(['shipper', 'carrier', 'operator']);
const COMPANY_RULES = verificationRules(['shipper', 'carrier']);

const STATUSES: { [E in Entity]: readonly StatusOf<E>[] } = {
  load: LOAD_STATUSES,
  offer: OFFER_STATUSES,
  trip: TRIP_STATUSES,
  document: VERIFICATION_STATUSES,
  company: VERIFICATION_STATUSES,
};

const RULES: { [E in Entity]: readonly Rule<StatusOf<E>>[] } = {
  load: LOAD_RULES,
  offer: OFFER_RULES,
  trip: TRIP_RULES,
  document: DOCUMENT_RULES,
  company: COMPANY_RULES,
};

function rulesFor<E extends Entity>(entity: E): readonly Rule<StatusOf<E>>[] {
  // Guard against unknown entities coming from untyped data.
  return Object.hasOwn(RULES, entity) ? RULES[entity] : [];
}

/**
 * Whether `actor` may move `entity` from `from` to `to`. Unknown statuses or
 * entities return `false`, so untyped values from the network are safe to pass.
 */
export function canTransition<E extends Entity>(
  entity: E,
  from: StatusOf<E>,
  to: StatusOf<E>,
  actor: Actor,
): boolean {
  return rulesFor(entity).some(
    (rule) => rule.to === to && rule.from.includes(from) && rule.by.includes(actor),
  );
}

/** Statuses `actor` may move `entity` to from `from`, in declaration order. */
export function nextStatuses<E extends Entity>(
  entity: E,
  from: StatusOf<E>,
  actor: Actor,
): StatusOf<E>[] {
  const result: StatusOf<E>[] = [];
  for (const rule of rulesFor(entity)) {
    if (rule.from.includes(from) && rule.by.includes(actor) && !result.includes(rule.to)) {
      result.push(rule.to);
    }
  }
  return result;
}

/** A status with no outgoing transition for any actor. */
export function isTerminalStatus<E extends Entity>(entity: E, status: StatusOf<E>): boolean {
  return !rulesFor(entity).some((rule) => rule.from.includes(status));
}

/** Every status of `entity`, for exhaustive checks and tests. */
export function statusesOf<E extends Entity>(entity: E): readonly StatusOf<E>[] {
  return Object.hasOwn(STATUSES, entity) ? STATUSES[entity] : [];
}
