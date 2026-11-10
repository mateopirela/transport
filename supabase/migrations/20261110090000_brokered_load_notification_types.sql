-- I6 · Brokered loads (D39): the notification types, in their own migration
-- because a value added to an enum cannot be used in the same transaction
-- (G.0.1). Copy and routes: packages/shared/src/copy/notifications.ts.
--   * brokered_load_requested: a client sent a load to the platform (admins).
--   * brokered_load_quoted: Transport set the client's price (the client).
--   * brokered_load_contracted: Transport found the carrier (the client).
alter type public.notification_type add value if not exists 'brokered_load_requested';
alter type public.notification_type add value if not exists 'brokered_load_quoted';
alter type public.notification_type add value if not exists 'brokered_load_contracted';
