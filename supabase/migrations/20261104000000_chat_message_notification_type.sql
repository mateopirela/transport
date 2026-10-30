-- Notification of a new message in the chat with the shipper: the trip chat
-- (`trip`) and the negotiation chat (`negotiation`). On its own, before the
-- migration that uses it (G.0.1: Postgres does not let a value added in a
-- transaction be used in that same transaction).
--   * notification_type 'chat_message': a new message in one of those
--     conversations; `data.kind` says which (push and inbox only; never email).
alter type public.notification_type add value if not exists 'chat_message';
