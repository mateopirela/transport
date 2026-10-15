// Domain enums. Values are the English identifiers stored in Postgres; the
// Spanish labels live in ./copy/catalogs.ts. Enums that already exist in SQL
// come from the generated types (./db.ts) so they cannot drift; the rest must
// match the SQL enums their blocks create (B04-B06).
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

export const TRIP_STATUSES = [
  'pending_assignment',
  'assigned',
  'en_route_to_pickup',
  'at_pickup',
  'loading',
  'in_transit',
  'at_delivery',
  'unloading',
  'delivered',
  'closed',
  'cancelled',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

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
