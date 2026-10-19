-- G6 · Notification types of the documents shared with the shipper, the
-- provider approval and the trip documents (D21, D22). Alone in their
-- migration: Postgres does not let the transaction that adds an enum value use
-- it (plan §G.0, rule 1).
alter type public.notification_type add value if not exists 'documents_shared';
alter type public.notification_type add value if not exists 'provider_status_changed';
alter type public.notification_type add value if not exists 'trip_document_added';
