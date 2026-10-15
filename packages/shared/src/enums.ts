// Domain enums. Values are the English identifiers stored in Postgres; the
// Spanish labels live in ./copy/catalogs.ts. Keep these lists in sync with the
// SQL enums (B01 and later blocks) and with the generated types in ./db.ts.

export const COMPANY_TYPES = ['shipper', 'carrier'] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const USER_ROLES = ['shipper', 'carrier', 'operator', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Shared by companies and documents (plan §1.1). */
export const VERIFICATION_STATUSES = [
  'pending_review',
  'approved',
  'rejected',
  'expired',
  'suspended',
] as const;
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
