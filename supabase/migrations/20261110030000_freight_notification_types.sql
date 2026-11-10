-- I3 · Notifications of the freight ledger (D08-E2, D33-E1, D34-E1). On their
-- own, before the migration that uses them (G.0.1: Postgres does not let a
-- value added in a transaction be used in that same transaction).
--   * freight_payment_received: the admin recorded a payment. To the shipper
--     ("Recibimos tu pago") for a payment of the client, and to the carrier
--     staff ("Fulmis te pagó $…") for a payment to the carrier. Each side only
--     gets its own amount.
--   * freight_overdue: the client's due date passed without the full payment
--     (to the admins and to the shipper).
--   * freight_on_hold: the carrier's due date passed and the client has not
--     paid: the carrier's payment is held (to the Gerente).
alter type public.notification_type add value if not exists 'freight_payment_received';
alter type public.notification_type add value if not exists 'freight_overdue';
alter type public.notification_type add value if not exists 'freight_on_hold';
