-- B14 · Client: offers, negotiation and chat. No new tables.
--
--   * load_negotiation_carriers(load): the shipper of a load (or an admin)
--     sees who negotiates it: carrier name and verification status, and the
--     conversation of each negotiation with the caller's unread messages.
--     companies_select only shows a user its own company, so the offers inbox
--     needs this narrow view of the carrier.
--   * load_offer_vehicles(load): the units proposed in the offers of a load,
--     without plate or fleet number, and whether their required documents are
--     complete. vehicles_select only shows a carrier its own fleet.
--   * Realtime: offers, message_reads and notifications join the
--     supabase_realtime publication (messages joined in B07), so the web
--     shows new offers, an acceptance closing the other offers, read receipts
--     and the notification badge without reloading. Realtime applies each
--     table's select policy to every subscriber.
--
-- Both functions are security definer, stable and read-only. They return rows
-- only for a load whose shipper company is the caller's, or to an admin.

-- ---------------------------------------------------------------------------
-- Carriers negotiating a load, with their conversation.
-- ---------------------------------------------------------------------------
create function public.load_negotiation_carriers(p_load_id uuid)
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
             and m.sender_id <> (select auth.uid())
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

revoke all on function public.load_negotiation_carriers(uuid) from public, anon;
grant execute on function public.load_negotiation_carriers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Units proposed in the offers of a load (no identifying data).
-- ---------------------------------------------------------------------------
create function public.load_offer_vehicles(p_load_id uuid)
returns table (
  vehicle_id uuid,
  kind public.vehicle_kind,
  unit_type public.unit_type,
  capacity_kg integer,
  capacity_m3 numeric,
  features public.special_requirement[],
  model_year integer,
  documents_complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.kind, v.unit_type, v.capacity_kg, v.capacity_m3, v.features, v.model_year,
         not exists (select 1 from public.vehicle_missing_requirements(v.id))
  from public.vehicles v
  where v.id in (
    select o.vehicle_id
    from public.offers o
    where o.load_id = p_load_id
      and o.vehicle_id is not null
      and (
        o.shipper_company_id = (select public.auth_shipper_company_id())
        or (select public.is_admin())
      )
  )
  order by v.id;
$$;

revoke all on function public.load_offer_vehicles(uuid) from public, anon;
grant execute on function public.load_offer_vehicles(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime for the offers inbox, read receipts and the notification badge.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.offers, public.message_reads, public.notifications;
