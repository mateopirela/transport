-- S1 · Avisos de la revisión de la empresa (D51). New notification types, in
-- their own migration (an enum value cannot be used in the transaction that
-- adds it):
--   * company_approved: the admin approved the company (its staff).
--   * company_rejected: the admin rejected it, with the reason (its staff).
alter type public.notification_type add value if not exists 'company_approved';
alter type public.notification_type add value if not exists 'company_rejected';
