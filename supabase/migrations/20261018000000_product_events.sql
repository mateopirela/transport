-- Product events (B25): the recommendation funnel that the domain does not
-- record (a carrier saw recommendations, opened one, offered from it). The
-- KPIs that the domain does record keep coming from the kpi_* views (B16).
--
-- * Written only through track_product_event: the caller, their role and
--   company come from the JWT (never from the client), the name is an enum and
--   the properties are an allowlist of scalar keys per event, so no personal
--   data can be stuffed in. Events are immutable.
-- * Read only by admins (analysis); nobody can update or delete them.
-- * A per-user cap drops floods silently instead of failing the app.

create type public.product_event_name as enum (
  'recommendations_viewed',
  'recommendation_opened',
  'offer_submitted'
);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  name public.product_event_name not null,
  occurred_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  user_role public.user_role,
  company_id uuid references public.companies (id) on delete set null,
  load_id uuid references public.loads (id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  constraint product_events_properties_object check (jsonb_typeof(properties) = 'object'),
  constraint product_events_properties_size check (octet_length(properties::text) <= 1024)
);

create index product_events_name_occurred_at_idx on public.product_events (name, occurred_at desc);
create index product_events_user_occurred_at_idx on public.product_events (user_id, occurred_at desc);
create index product_events_load_id_idx on public.product_events (load_id) where load_id is not null;

alter table public.product_events enable row level security;

-- Clients never touch the table directly: only the RPC below writes it.
revoke all on public.product_events from anon, authenticated;
grant select on public.product_events to authenticated;

create policy product_events_select_admin on public.product_events
  for select to authenticated
  using ((select public.is_admin()));

-- No insert, update or delete policy: events are immutable and RPC-only.

create function public.track_product_event(
  p_name public.product_event_name,
  p_load_id uuid default null,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_allowed text[];
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'profile not found' using errcode = '42501';
  end if;

  -- Same allowlist as packages/shared/src/observability/events.ts.
  v_allowed := case p_name
    when 'recommendations_viewed' then array['recommendations', 'return_trips', 'units']
    when 'recommendation_opened' then array['vehicle_id', 'rank', 'score', 'return_trip']
    when 'offer_submitted' then array['source', 'counter']
  end;

  if jsonb_typeof(v_properties) is distinct from 'object'
     or octet_length(v_properties::text) > 1024
     or exists (
       select 1 from jsonb_each(v_properties) e
       where not (e.key = any (v_allowed))
          or jsonb_typeof(e.value) not in ('string', 'number', 'boolean')
          or (jsonb_typeof(e.value) = 'string' and length(e.value #>> '{}') > 64)
     ) then
    raise exception 'invalid product event properties' using errcode = '22023';
  end if;

  -- Flood guard: beyond 60 events per user and minute new ones are dropped
  -- silently (analytics must never break the app). The per-user advisory
  -- lock makes the count and the insert atomic under concurrent calls.
  perform pg_advisory_xact_lock(hashtextextended('product_events:' || v_uid::text, 0));
  if (
    select count(*) from public.product_events
    where user_id = v_uid and occurred_at > now() - interval '1 minute'
  ) >= 60 then
    return;
  end if;

  insert into public.product_events (name, user_id, user_role, company_id, load_id, properties)
  values (
    p_name,
    v_uid,
    v_profile.role,
    v_profile.company_id,
    -- An unknown load is stored as null (no error, so no existence oracle).
    (select l.id from public.loads l where l.id = p_load_id),
    v_properties
  );
end;
$$;

revoke all on function public.track_product_event(public.product_event_name, uuid, jsonb) from public, anon;
grant execute on function public.track_product_event(public.product_event_name, uuid, jsonb) to authenticated;

comment on table public.product_events is
  'Product analytics events (B25): recommendation funnel. Immutable; written only by track_product_event; admins read.';
