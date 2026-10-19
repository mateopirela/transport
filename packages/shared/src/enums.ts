// Domain enums. Values are the English identifiers stored in Postgres; the
// Spanish labels live in ./copy/catalogs.ts. Enums that already exist in SQL
// come from the generated types (./db.ts) so they cannot drift; the rest must
// match the SQL enums their blocks create (B04-B05).
import { Constants } from './db';

const DB_ENUMS = Constants.public.Enums;

export const COMPANY_TYPES = DB_ENUMS.company_type;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const USER_ROLES = DB_ENUMS.user_role;
export type UserRole = (typeof USER_ROLES)[number];

/** Shared by companies and documents (plan §1.1). */
export const VERIFICATION_STATUSES = DB_ENUMS.verification_status;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const LOAD_STATUSES = [
  'draft',
  'published',
  'negotiating',
  'contracted',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const OFFER_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'countered',
  'withdrawn',
  'expired',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_SIDES = ['shipper', 'carrier'] as const;
export type OfferSide = (typeof OFFER_SIDES)[number];

export const TRIP_STATUSES = DB_ENUMS.trip_status;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Entries of a trip's timeline (trip_events, B06). */
export const TRIP_EVENT_TYPES = DB_ENUMS.trip_event_type;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

/** Why a trip was cancelled (cancel_trip, G5). */
export const TRIP_CANCELLATION_REASONS = DB_ENUMS.trip_cancellation_reason;
export type TripCancellationReason = (typeof TRIP_CANCELLATION_REASONS)[number];

/** Who cancelled a trip (trips.cancelled_by_side, G5). */
export type TripCancellationSide = (typeof DB_ENUMS.trip_cancellation_side)[number];

/** A unit waiting to be released after its trip was cancelled on the way (G5, D20). */
export const RELEASE_TASK_STATUSES = DB_ENUMS.release_task_status;
export type ReleaseTaskStatus = (typeof RELEASE_TASK_STATUSES)[number];

/** Moment of the trip a photo documents (trip_evidence, B06). */
export const EVIDENCE_STAGES = DB_ENUMS.evidence_stage;
export type EvidenceStage = (typeof EVIDENCE_STAGES)[number];

export const INCIDENT_KINDS = DB_ENUMS.incident_kind;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_STATUSES = DB_ENUMS.incident_status;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Kind of a trip document (trip_documents, B15). Carta Porte is only stored (D09). */
export const TRIP_DOCUMENT_KINDS = DB_ENUMS.trip_document_kind;
export type TripDocumentKind = (typeof TRIP_DOCUMENT_KINDS)[number];

/** A conversation belongs to a negotiation or to a trip (conversations, B07). */
export const CONVERSATION_KINDS = DB_ENUMS.conversation_kind;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

/** Key events that reach a user's inbox, push and email (notifications, B07). */
export const NOTIFICATION_TYPES = DB_ENUMS.notification_type;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A shipper's decision about a carrier as its provider (provider_approvals, G6). No row = pending. */
export const PROVIDER_STATUSES = DB_ENUMS.provider_status;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

/** Why a document was shared with the shipper of a trip (document_shares, G6). */
export const DOCUMENT_SHARE_REASONS = DB_ENUMS.document_share_reason;
export type DocumentShareReason = (typeof DOCUMENT_SHARE_REASONS)[number];

/** Why a shared document stopped being shared (document_shares, G6). */
export const DOCUMENT_SHARE_REVOKE_REASONS = DB_ENUMS.document_share_revoke_reason;
export type DocumentShareRevokeReason = (typeof DOCUMENT_SHARE_REVOKE_REASONS)[number];

export const PUSH_PLATFORMS = DB_ENUMS.push_platform;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** What an invitation link is for (invitations, G1b). */
export const INVITATION_KINDS = DB_ENUMS.invitation_kind;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

export const VEHICLE_KINDS = ['tractor', 'rigid', 'trailer'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

/** Unit (body) types used to match loads with vehicles. */
export const UNIT_TYPES = [
  'dry_van',
  'refrigerated',
  'flatbed',
  'lowboy',
  'hopper',
  'tanker',
  'container_chassis',
  'cage',
  'stake_bed',
  'torton',
  'rabon',
  'pickup_3_5t',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const CARGO_TYPES = [
  'general',
  'palletized',
  'perishable',
  'dry_bulk',
  'liquid_bulk',
  'hazardous',
  'oversized',
  'containerized',
  'vehicles',
  'construction_materials',
  'livestock',
] as const;
export type CargoType = (typeof CARGO_TYPES)[number];

/** Requirements a load may ask for and a vehicle may provide (its features). */
export const SPECIAL_REQUIREMENTS = [
  'temperature_control',
  'hazmat_permit',
  'liftgate',
  'tarp',
  'cargo_securing',
  'security_escort',
  'team_drivers',
  'extended_cargo_insurance',
  'loading_crew',
] as const;
export type SpecialRequirement = (typeof SPECIAL_REQUIREMENTS)[number];

/** Federal driver's license types that allow moving freight (SICT). */
export const LICENSE_TYPES = ['B', 'C', 'E'] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];
