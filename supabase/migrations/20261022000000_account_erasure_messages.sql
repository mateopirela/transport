-- F6 · Deleting an account that sent chat messages (D18, proposed):
--   messages.sender_id was `on delete restrict`, so the account of anyone who
--   had written in a chat could not be deleted. The messages are a record of
--   what was agreed (D01) that the counterpart and any dispute still need, so
--   they stay, anonymized: the sender's account is erased (sender_id becomes
--   null) and the rest of the row (role, body, attachments, time) is kept.
--   Messages stay immutable: reject_mutation_except_user_erasure (F2) lets
--   through only that erasure. Supersedes the note in the header of
--   20261020020000_db_integrity_fixes.sql.

-- ---------------------------------------------------------------------------
-- 1. sender_id: nullable and `on delete set null`
-- ---------------------------------------------------------------------------
alter table public.messages alter column sender_id drop not null;

alter table public.messages drop constraint messages_sender_id_fkey;
alter table public.messages add constraint messages_sender_id_fkey
  foreign key (sender_id) references auth.users (id) on delete set null;

comment on column public.messages.sender_id is
  'Author of the message; null once their account was deleted (D18). send_message always sets it.';

drop trigger messages_immutable on public.messages;
create trigger messages_immutable before update or delete on public.messages
for each row execute function public.reject_mutation_except_user_erasure('sender_id');

-- ---------------------------------------------------------------------------
-- 2. Unread count: a message without a sender is not the viewer's, so it is
-- unread until their marker covers it (`<>` against null left it out).
-- Same body as B12 otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.load_negotiation_carriers(p_load_id uuid)
returns table (
  negotiation_id uuid,
  conversation_id uuid,
  carrier_company_id uuid,
  carrier_legal_name text,
  carrier_status public.verification_status,
  unread_messages bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, cv.id, c.id, c.legal_name, c.status,
         (
           select count(*)
           from public.messages m
           where m.conversation_id = cv.id
             and m.sender_id is distinct from (select auth.uid())
             and m.created_at > coalesce(
               (select r.last_read_at from public.message_reads r
                where r.conversation_id = cv.id and r.user_id = (select auth.uid())),
               '-infinity'::timestamptz
             )
         )
  from public.negotiations n
  join public.companies c on c.id = n.carrier_company_id
  left join public.conversations cv on cv.negotiation_id = n.id
  where n.load_id = p_load_id
    and (
      n.shipper_company_id = (select public.auth_shipper_company_id())
      or (select public.is_admin())
    )
  order by n.created_at, n.id;
$$;
