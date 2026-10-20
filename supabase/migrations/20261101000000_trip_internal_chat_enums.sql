-- H1.1 · Enum values of the carrier's internal trip chat (D28). On their own,
-- before the migration that uses them (G.0.1: Postgres does not let a value
-- added in a transaction be used in that same transaction).
--   * conversation_kind 'trip_internal': the conversation of a trip between
--     the assigned operator, the coordinators of its business unit and the
--     managers. Never the shipper.
--   * notification_type 'internal_message': a new message in that
--     conversation (push and inbox only; never email).
alter type public.conversation_kind add value if not exists 'trip_internal';
alter type public.notification_type add value if not exists 'internal_message';
