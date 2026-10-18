-- G5 · Values for the cancellation of a trip that already set off (D20).
--   On their own migration because Postgres cannot use a value added to an
--   enum in the same transaction (§G.0, rule 1); the next migration uses them.
--   * availability_source 'release': the availability a coordinator or the
--     manager writes when releasing a unit (release_vehicle).
--   * notification_type 'vehicle_release_pending' (the unit waits for its
--     coordinator to confirm where it is) and 'vehicle_released'.

alter type public.availability_source add value if not exists 'release';
alter type public.notification_type add value if not exists 'vehicle_release_pending';
alter type public.notification_type add value if not exists 'vehicle_released';
