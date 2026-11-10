-- I4 · Quick pay (D38): the notification types, in their own migration
-- because a value added to an enum cannot be used in the same transaction
-- (G.0.1). Copy and routes: packages/shared/src/copy/notifications.ts.
--   * quick_pay_requested: a carrier asked to be paid before the client's
--     terms (the admins, who approve or reject it).
--   * quick_pay_approved: the admin approved it; the payment is scheduled
--     (the carrier staff, with the quick net).
--   * quick_pay_rejected: the admin rejected it, with the reason (the
--     carrier staff).
alter type public.notification_type add value if not exists 'quick_pay_requested';
alter type public.notification_type add value if not exists 'quick_pay_approved';
alter type public.notification_type add value if not exists 'quick_pay_rejected';
