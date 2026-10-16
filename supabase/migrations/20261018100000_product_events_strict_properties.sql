-- Product events (B25): validate each event's properties strictly in SQL.
--
-- The first version only checked property names and scalar types, so a client
-- that bypassed the app could store free text (e.g. an email) under an allowed
-- key. Now every event has an exact set of required keys, each with its type
-- and allowed values or range, mirroring productEventSchemas in
-- packages/shared/src/observability/events.ts. No free-text value is accepted.

create function public.product_event_properties_valid(p_name public.product_event_name, p_properties jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Numbers are read through a CASE so a non-number never reaches the cast
  -- (SQL does not guarantee short-circuit evaluation of AND).
  with p as (
    select
      p_properties as v,
      (select array_agg(k order by k) from jsonb_object_keys(
        case when jsonb_typeof(p_properties) = 'object' then p_properties else '{}'::jsonb end
      ) k) as keys
  ),
  n as (
    select p.*,
      case when jsonb_typeof(p.v -> 'recommendations') = 'number' then (p.v ->> 'recommendations')::numeric end as recommendations,
      case when jsonb_typeof(p.v -> 'return_trips') = 'number' then (p.v ->> 'return_trips')::numeric end as return_trips,
      case when jsonb_typeof(p.v -> 'units') = 'number' then (p.v ->> 'units')::numeric end as units,
      case when jsonb_typeof(p.v -> 'rank') = 'number' then (p.v ->> 'rank')::numeric end as rank,
      case when jsonb_typeof(p.v -> 'score') = 'number' then (p.v ->> 'score')::numeric end as score
    from p
    where jsonb_typeof(p.v) = 'object'
  )
  select coalesce((
    select case p_name
      when 'recommendations_viewed' then
        n.keys = array['recommendations', 'return_trips', 'units']
        and n.recommendations = trunc(n.recommendations) and n.recommendations between 0 and 1000
        and n.return_trips = trunc(n.return_trips) and n.return_trips between 0 and 1000
        and n.units = trunc(n.units) and n.units between 0 and 1000
      when 'recommendation_opened' then
        n.keys = array['rank', 'return_trip', 'score', 'vehicle_id']
        and jsonb_typeof(n.v -> 'vehicle_id') = 'string'
        and (n.v ->> 'vehicle_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and n.rank = trunc(n.rank) and n.rank between 1 and 100
        and n.score between -100000 and 100000
        and jsonb_typeof(n.v -> 'return_trip') = 'boolean'
      when 'offer_submitted' then
        n.keys = array['counter', 'source']
        and jsonb_typeof(n.v -> 'source') = 'string'
        and (n.v ->> 'source') in ('recommendation', 'search')
        and jsonb_typeof(n.v -> 'counter') = 'boolean'
      else false
    end
    from n
  ), false);
$$;

-- Internal helper of track_product_event (which runs as its owner).
revoke all on function public.product_event_properties_valid(public.product_event_name, jsonb)
  from public, anon, authenticated;

create or replace function public.track_product_event(
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
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'profile not found' using errcode = '42501';
  end if;

  -- Exact keys, types and values per event (same as productEventSchemas).
  if octet_length(v_properties::text) > 1024
     or not public.product_event_properties_valid(p_name, v_properties) then
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
