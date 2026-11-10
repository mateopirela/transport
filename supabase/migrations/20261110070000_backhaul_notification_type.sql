-- I7 · Carga de regreso (D40). On its own, before the migration that uses it
-- (G.0.1: Postgres does not let a value added in a transaction be used in that
-- same transaction).
--   * notification_type 'backhaul_suggestions': a trip reached its destination
--     (or came within 50 km of it) and there are compatible loads near there
--     for when its unit is free; to the managers and the coordinators of the
--     trip's business unit, once per trip.
alter type public.notification_type add value if not exists 'backhaul_suggestions';
