-- I1 · Cargo insurance of the shipper (D35-E1). Enum values on their own,
-- before the migration that uses them (G.0.1: Postgres does not let a value
-- added in a transaction be used in that same transaction).
--   * trip_document_kind 'cargo_insurance': the policy or certificate of one
--     trip, uploaded by the shipper before the departure.
--   * notification_type 'cargo_insurance_missing': the trip has no proof of
--     cargo insurance (at acceptance, and 24 hours before the pickup).
alter type public.trip_document_kind add value if not exists 'cargo_insurance' before 'other';
alter type public.notification_type add value if not exists 'cargo_insurance_missing';
