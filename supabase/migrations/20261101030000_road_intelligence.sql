-- H4 · Road intelligence (D31): which way to go, what the tolls cost and
-- where the road is unsafe at the hour the truck passes.
--
--   * Catalog (reference data, edited by admins with audit, like G3):
--     road_segments (one stretch of highway between two cities),
--     road_segment_tolls (toll per truck class, dated; null = "Sin dato"),
--     road_segment_risks (insecurity level per segment and hour band) and
--     road_corridors + road_corridor_segments (an ordered way from an origin
--     area to a destination area). Every figure carries its source, its date
--     and whether it is estimated or verified (H.0.5: nothing is invented;
--     what has no source stays empty).
--   * vehicles.axle_count: the truck's axles (2–9), which pick the toll
--     class. Null means the default of its kind and body (defaultAxleCount in
--     packages/shared/src/roads).
--   * carrier_road_preferences: segments a carrier prefers or avoids, for one
--     of its usual routes or for all of them. Read and written by the manager
--     and the coordinators (auth_carrier_company_id()), archived, never deleted.
--   * road_catalog(): active corridors with their segments, current tolls and
--     active risks, as one JSON array (security invoker, reference data only).
--   * Admin RPCs (admin_upsert_road_segment, admin_set_segment_toll,
--     admin_upsert_segment_risk, admin_upsert_corridor): validate, write and
--     leave every change in audit_log (audit_admin_action).

create type public.road_data_status as enum ('estimated', 'verified');
create type public.road_risk_level as enum ('low', 'medium', 'high');
-- Truck classes of the published toll tariffs: C2 … C9 (2 to 9 axles).
create type public.toll_vehicle_class as enum ('c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9');
create type public.road_preference as enum ('prefer', 'avoid');

-- ---------------------------------------------------------------------------
-- road_segments
-- ---------------------------------------------------------------------------
create table public.road_segments (
  id uuid primary key default gen_random_uuid(),
  code text not null constraint road_segments_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  name text not null constraint road_segments_name_length check (char_length(btrim(name)) between 1 and 120),
  highway text constraint road_segments_highway_length check (char_length(highway) <= 40),
  from_city text not null constraint road_segments_from_city_length check (char_length(btrim(from_city)) between 1 and 120),
  from_state text not null constraint road_segments_from_state_length check (char_length(btrim(from_state)) between 1 and 60),
  from_lat double precision not null constraint road_segments_from_lat_range check (from_lat between -90 and 90),
  from_lng double precision not null constraint road_segments_from_lng_range check (from_lng between -180 and 180),
  to_city text not null constraint road_segments_to_city_length check (char_length(btrim(to_city)) between 1 and 120),
  to_state text not null constraint road_segments_to_state_length check (char_length(btrim(to_state)) between 1 and 60),
  to_lat double precision not null constraint road_segments_to_lat_range check (to_lat between -90 and 90),
  to_lng double precision not null constraint road_segments_to_lng_range check (to_lng between -180 and 180),
  distance_km numeric(6, 1) not null constraint road_segments_distance_range check (distance_km > 0 and distance_km <= 3000),
  is_toll boolean not null default false,
  notes text constraint road_segments_notes_length check (char_length(notes) <= 1000),
  source text not null constraint road_segments_source_length check (char_length(btrim(source)) between 1 and 300),
  source_url text constraint road_segments_source_url_format check (source_url ~ '^https://\S+$' and char_length(source_url) <= 500),
  source_date date not null,
  data_status public.road_data_status not null default 'estimated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.road_segments is
  'Stretches of highway between two cities (D31), with distance, whether they charge tolls, source and date. Edited by admins.';

create unique index road_segments_code_key on public.road_segments (code);

create trigger road_segments_set_updated_at
before update on public.road_segments
for each row execute function public.set_updated_at();

create trigger road_segments_audit_admin
after insert or update or delete on public.road_segments
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- road_segment_tolls: one row per segment, truck class and start of validity.
-- amount_cents null = the class is charged but its tariff is unknown.
-- ---------------------------------------------------------------------------
create table public.road_segment_tolls (
  -- For audit_log.record_id; the natural key is the primary key below.
  id uuid not null default gen_random_uuid() constraint road_segment_tolls_id_key unique,
  segment_id uuid not null references public.road_segments (id) on delete restrict,
  vehicle_class public.toll_vehicle_class not null,
  amount_cents bigint constraint road_segment_tolls_amount_range check (amount_cents between 0 and 10000000),
  source text not null constraint road_segment_tolls_source_length check (char_length(btrim(source)) between 1 and 300),
  source_url text constraint road_segment_tolls_source_url_format check (source_url ~ '^https://\S+$' and char_length(source_url) <= 500),
  valid_from date not null,
  data_status public.road_data_status not null default 'estimated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (segment_id, vehicle_class, valid_from)
);

comment on table public.road_segment_tolls is
  'Toll of a segment per truck class (C2–C9), dated and with its source (D31). Null amount = "Sin dato". Edited by admins.';

create trigger road_segment_tolls_set_updated_at
before update on public.road_segment_tolls
for each row execute function public.set_updated_at();

create trigger road_segment_tolls_audit_admin
after insert or update or delete on public.road_segment_tolls
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- road_segment_risks: insecurity of a segment in an hour band of Mexico City
-- time. from_hour > to_hour crosses midnight; 0–24 is the whole day.
-- ---------------------------------------------------------------------------
create table public.road_segment_risks (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.road_segments (id) on delete restrict,
  level public.road_risk_level not null,
  from_hour smallint not null constraint road_segment_risks_from_hour_range check (from_hour between 0 and 23),
  to_hour smallint not null constraint road_segment_risks_to_hour_range check (to_hour between 1 and 24),
  description text not null constraint road_segment_risks_description_length check (char_length(btrim(description)) between 1 and 300),
  source text not null constraint road_segment_risks_source_length check (char_length(btrim(source)) between 1 and 300),
  source_url text constraint road_segment_risks_source_url_format check (source_url ~ '^https://\S+$' and char_length(source_url) <= 500),
  observed_on date not null,
  data_status public.road_data_status not null default 'estimated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint road_segment_risks_band check (from_hour <> to_hour)
);

comment on table public.road_segment_risks is
  'Insecurity level of a segment per hour band (America/Mexico_City), with its source and date (D31). Edited by admins.';

create index road_segment_risks_segment_id_idx on public.road_segment_risks (segment_id) where archived_at is null;

create trigger road_segment_risks_set_updated_at
before update on public.road_segment_risks
for each row execute function public.set_updated_at();

create trigger road_segment_risks_audit_admin
after insert or update or delete on public.road_segment_risks
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- road_corridors + road_corridor_segments
-- ---------------------------------------------------------------------------
create table public.road_corridors (
  id uuid primary key default gen_random_uuid(),
  code text not null constraint road_corridors_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  name text not null constraint road_corridors_name_length check (char_length(btrim(name)) between 1 and 120),
  origin_city text not null constraint road_corridors_origin_city_length check (char_length(btrim(origin_city)) between 1 and 120),
  origin_state text not null constraint road_corridors_origin_state_length check (char_length(btrim(origin_state)) between 1 and 60),
  origin_lat double precision not null constraint road_corridors_origin_lat_range check (origin_lat between -90 and 90),
  origin_lng double precision not null constraint road_corridors_origin_lng_range check (origin_lng between -180 and 180),
  origin_radius_km numeric(5, 1) not null default 60 constraint road_corridors_origin_radius_range check (origin_radius_km between 1 and 300),
  destination_city text not null constraint road_corridors_destination_city_length check (char_length(btrim(destination_city)) between 1 and 120),
  destination_state text not null constraint road_corridors_destination_state_length check (char_length(btrim(destination_state)) between 1 and 60),
  destination_lat double precision not null constraint road_corridors_destination_lat_range check (destination_lat between -90 and 90),
  destination_lng double precision not null constraint road_corridors_destination_lng_range check (destination_lng between -180 and 180),
  destination_radius_km numeric(5, 1) not null default 60 constraint road_corridors_destination_radius_range check (destination_radius_km between 1 and 300),
  -- Usable in both directions (the segments are then run backwards).
  bidirectional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.road_corridors is
  'A way from an origin area to a destination area through an ordered list of segments (D31). Edited by admins.';

create unique index road_corridors_code_key on public.road_corridors (code);

create trigger road_corridors_set_updated_at
before update on public.road_corridors
for each row execute function public.set_updated_at();

create trigger road_corridors_audit_admin
after insert or update or delete on public.road_corridors
for each row execute function public.audit_admin_action();

create table public.road_corridor_segments (
  -- For audit_log.record_id; the natural key is the primary key below.
  id uuid not null default gen_random_uuid() constraint road_corridor_segments_id_key unique,
  corridor_id uuid not null references public.road_corridors (id) on delete restrict,
  seq smallint not null constraint road_corridor_segments_seq_range check (seq between 1 and 100),
  segment_id uuid not null references public.road_segments (id) on delete restrict,
  primary key (corridor_id, seq),
  constraint road_corridor_segments_segment_key unique (corridor_id, segment_id)
);

comment on table public.road_corridor_segments is 'Segments of a corridor, in order from its origin (D31).';

create index road_corridor_segments_segment_id_idx on public.road_corridor_segments (segment_id);

create trigger road_corridor_segments_audit_admin
after insert or update or delete on public.road_corridor_segments
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- vehicles.axle_count (nullable: the default of the kind applies)
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column axle_count smallint constraint vehicles_axle_count_range check (axle_count between 2 and 9);

comment on column public.vehicles.axle_count is
  'Axles of the truck (with its trailer), 2–9; picks the toll class (D31). Null = the default of its kind and body.';

grant insert (axle_count) on table public.vehicles to authenticated;
grant update (axle_count) on table public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- carrier_road_preferences
-- ---------------------------------------------------------------------------
create table public.carrier_road_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  -- Null = every route of the company.
  carrier_route_id uuid references public.carrier_routes (id) on delete restrict,
  segment_id uuid not null references public.road_segments (id) on delete restrict,
  preference public.road_preference not null,
  notes text constraint carrier_road_preferences_notes_length check (char_length(notes) <= 500),
  -- Who marked it; no foreign key, so erasing an account keeps the row.
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.carrier_road_preferences is
  'Segments a carrier prefers or avoids, on one usual route or on all of them (D31). Archived, never deleted.';

-- One active preference per company, route (or all routes) and segment.
create unique index carrier_road_preferences_active_key on public.carrier_road_preferences (
  company_id, coalesce(carrier_route_id, '00000000-0000-0000-0000-000000000000'::uuid), segment_id
) where archived_at is null;
create index carrier_road_preferences_company_id_idx on public.carrier_road_preferences (company_id)
  where archived_at is null;
create index carrier_road_preferences_carrier_route_id_idx on public.carrier_road_preferences (carrier_route_id)
  where carrier_route_id is not null;
create index carrier_road_preferences_segment_id_idx on public.carrier_road_preferences (segment_id);

create trigger carrier_road_preferences_set_updated_at
before update on public.carrier_road_preferences
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------
revoke all on table public.road_segments, public.road_segment_tolls, public.road_segment_risks,
  public.road_corridors, public.road_corridor_segments, public.carrier_road_preferences
  from anon, authenticated;
grant select on table public.road_segments, public.road_segment_tolls, public.road_segment_risks,
  public.road_corridors, public.road_corridor_segments, public.carrier_road_preferences
  to authenticated;
grant insert (id, company_id, carrier_route_id, segment_id, preference, notes)
  on table public.carrier_road_preferences to authenticated;
grant update (preference, notes, archived_at) on table public.carrier_road_preferences to authenticated;

alter table public.road_segments enable row level security;
alter table public.road_segment_tolls enable row level security;
alter table public.road_segment_risks enable row level security;
alter table public.road_corridors enable row level security;
alter table public.road_corridor_segments enable row level security;
alter table public.carrier_road_preferences enable row level security;

-- Reference data: everyone signed in reads it; archived rows only admins.
create policy road_segments_select
on public.road_segments
for select
to authenticated
using (archived_at is null or (select public.is_admin()));

create policy road_segment_tolls_select
on public.road_segment_tolls
for select
to authenticated
using ((select auth.uid()) is not null);

create policy road_segment_risks_select
on public.road_segment_risks
for select
to authenticated
using (archived_at is null or (select public.is_admin()));

create policy road_corridors_select
on public.road_corridors
for select
to authenticated
using (archived_at is null or (select public.is_admin()));

create policy road_corridor_segments_select
on public.road_corridor_segments
for select
to authenticated
using ((select auth.uid()) is not null);

-- Preferences: the carrier's manager and coordinators (like carrier_routes);
-- admins read. A route of another company or an archived segment is refused.
create policy carrier_road_preferences_select
on public.carrier_road_preferences
for select
to authenticated
using (
  company_id = (select public.auth_carrier_company_id())
  or (select public.is_admin())
);

create policy carrier_road_preferences_insert
on public.carrier_road_preferences
for insert
to authenticated
with check (
  company_id = (select public.auth_carrier_company_id())
  and exists (select 1 from public.road_segments s where s.id = segment_id and s.archived_at is null)
  and (
    carrier_route_id is null
    or exists (
      select 1 from public.carrier_routes r
      where r.id = carrier_route_id and r.company_id = carrier_road_preferences.company_id and r.archived_at is null
    )
  )
);

create policy carrier_road_preferences_update
on public.carrier_road_preferences
for update
to authenticated
using (company_id = (select public.auth_carrier_company_id()))
with check (company_id = (select public.auth_carrier_company_id()));

-- ---------------------------------------------------------------------------
-- set_carrier_road_preference: replaces the active preference of the caller's
-- company for a segment on a route (no route = all routes); no preference
-- clears it. Security invoker: the grants and policies above decide.
-- ---------------------------------------------------------------------------
create function public.set_carrier_road_preference(
  p_segment_id uuid,
  p_preference public.road_preference default null,
  p_carrier_route_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid := public.auth_carrier_company_id();
  v_id uuid;
begin
  if v_company is null then
    raise exception 'only carrier staff mark road preferences' using errcode = '42501';
  end if;
  if p_segment_id is null then
    raise exception 'a segment is required' using errcode = '22023';
  end if;

  select p.id into v_id
  from public.carrier_road_preferences p
  where p.company_id = v_company
    and p.carrier_route_id is not distinct from p_carrier_route_id
    and p.segment_id = p_segment_id
    and p.archived_at is null
  for update;

  if found and p_preference is not null then
    update public.carrier_road_preferences set preference = p_preference where id = v_id;
    return v_id;
  end if;
  if found then
    update public.carrier_road_preferences set archived_at = now() where id = v_id;
    return null;
  end if;
  if p_preference is null then
    return null;
  end if;
  insert into public.carrier_road_preferences (company_id, carrier_route_id, segment_id, preference)
  values (v_company, p_carrier_route_id, p_segment_id, p_preference)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.set_carrier_road_preference(uuid, public.road_preference, uuid) from public, anon;
grant execute on function public.set_carrier_road_preference(uuid, public.road_preference, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- road_catalog: active corridors (none with an archived segment), each with
-- its segments in order, the current toll of each class (the latest
-- valid_from not after today in Mexico City) and the active risks.
-- ---------------------------------------------------------------------------
create function public.road_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with today as (
    select (now() at time zone 'America/Mexico_City')::date as d
  ),
  segment_json as (
    select s.id,
           jsonb_build_object(
             'id', s.id,
             'code', s.code,
             'name', s.name,
             'highway', s.highway,
             'from', jsonb_build_object('city', s.from_city, 'state', s.from_state, 'lat', s.from_lat, 'lng', s.from_lng),
             'to', jsonb_build_object('city', s.to_city, 'state', s.to_state, 'lat', s.to_lat, 'lng', s.to_lng),
             'distanceKm', s.distance_km,
             'isToll', s.is_toll,
             'source', s.source,
             'sourceUrl', s.source_url,
             'sourceDate', s.source_date,
             'dataStatus', s.data_status,
             'tolls', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'vehicleClass', t.vehicle_class,
                        'amountCents', t.amount_cents,
                        'source', t.source,
                        'sourceUrl', t.source_url,
                        'validFrom', t.valid_from,
                        'dataStatus', t.data_status
                      ) order by t.vehicle_class)
               from (
                 select distinct on (x.vehicle_class) x.*
                 from public.road_segment_tolls x, today
                 where x.segment_id = s.id and x.valid_from <= today.d
                 order by x.vehicle_class, x.valid_from desc
               ) t
             ), '[]'::jsonb),
             'risks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', r.id,
                        'level', r.level,
                        'fromHour', r.from_hour,
                        'toHour', r.to_hour,
                        'description', r.description,
                        'source', r.source,
                        'sourceUrl', r.source_url,
                        'observedOn', r.observed_on,
                        'dataStatus', r.data_status
                      ) order by r.from_hour, r.id)
               from public.road_segment_risks r
               where r.segment_id = s.id and r.archived_at is null
             ), '[]'::jsonb)
           ) as body
    from public.road_segments s
    where s.archived_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'code', c.code,
           'name', c.name,
           'bidirectional', c.bidirectional,
           'origin', jsonb_build_object('city', c.origin_city, 'state', c.origin_state, 'lat', c.origin_lat,
                                        'lng', c.origin_lng, 'radiusKm', c.origin_radius_km),
           'destination', jsonb_build_object('city', c.destination_city, 'state', c.destination_state,
                                             'lat', c.destination_lat, 'lng', c.destination_lng,
                                             'radiusKm', c.destination_radius_km),
           'segments', (
             select jsonb_agg(sj.body order by cs.seq)
             from public.road_corridor_segments cs
             join segment_json sj on sj.id = cs.segment_id
             where cs.corridor_id = c.id
           )
         ) order by c.code), '[]'::jsonb)
  from public.road_corridors c
  where c.archived_at is null
    and exists (select 1 from public.road_corridor_segments cs where cs.corridor_id = c.id)
    -- Every link must reach an active segment. Security invoker: RLS hides
    -- archived segments from non-admins, so a missing one is checked by
    -- counting the active segments found, not by looking for archived ones.
    and (select count(*) from public.road_corridor_segments cs where cs.corridor_id = c.id)
      = (select count(*) from public.road_corridor_segments cs
         join public.road_segments s on s.id = cs.segment_id and s.archived_at is null
         where cs.corridor_id = c.id);
$$;

revoke all on function public.road_catalog() from public, anon;
grant execute on function public.road_catalog() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin RPCs. Each one checks is_admin(), validates what the table checks do
-- not (required source and date, dates not in the future) and writes; the
-- audit triggers record the change with the admin as actor.
-- ---------------------------------------------------------------------------
create function public.assert_road_source(p_source text, p_source_url text, p_date date, p_date_field text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if nullif(btrim(p_source), '') is null then
    raise exception 'a source is required' using errcode = '22023';
  end if;
  if p_source_url is not null and p_source_url !~ '^https://\S+$' then
    raise exception 'the source link must be an https URL' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception '% is required', p_date_field using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_road_source(text, text, date, text) from public, anon, authenticated;

-- Optional arguments last (PostgREST calls them by name): no id creates.
create function public.admin_upsert_road_segment(
  p_code text,
  p_name text,
  p_from_city text,
  p_from_state text,
  p_from_lat double precision,
  p_from_lng double precision,
  p_to_city text,
  p_to_state text,
  p_to_lat double precision,
  p_to_lng double precision,
  p_distance_km numeric,
  p_is_toll boolean,
  p_source text,
  p_source_date date,
  p_data_status public.road_data_status,
  p_id uuid default null,
  p_highway text default null,
  p_notes text default null,
  p_source_url text default null,
  p_archived boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins edit the road catalog' using errcode = '42501';
  end if;
  perform public.assert_road_source(p_source, nullif(btrim(p_source_url), ''), p_source_date, 'source_date');
  if p_source_date > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'source_date cannot be in the future' using errcode = '22023';
  end if;
  if p_data_status is null or p_is_toll is null then
    raise exception 'data_status and is_toll are required' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.road_segments (
      code, name, highway, from_city, from_state, from_lat, from_lng, to_city, to_state, to_lat, to_lng,
      distance_km, is_toll, notes, source, source_url, source_date, data_status, archived_at
    ) values (
      upper(btrim(p_code)), btrim(p_name), nullif(btrim(p_highway), ''), btrim(p_from_city), btrim(p_from_state),
      p_from_lat, p_from_lng, btrim(p_to_city), btrim(p_to_state), p_to_lat, p_to_lng, p_distance_km, p_is_toll,
      nullif(btrim(p_notes), ''), btrim(p_source), nullif(btrim(p_source_url), ''), p_source_date, p_data_status,
      case when coalesce(p_archived, false) then now() end
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.road_segments
  set code = upper(btrim(p_code)),
      name = btrim(p_name),
      highway = nullif(btrim(p_highway), ''),
      from_city = btrim(p_from_city),
      from_state = btrim(p_from_state),
      from_lat = p_from_lat,
      from_lng = p_from_lng,
      to_city = btrim(p_to_city),
      to_state = btrim(p_to_state),
      to_lat = p_to_lat,
      to_lng = p_to_lng,
      distance_km = p_distance_km,
      is_toll = p_is_toll,
      notes = nullif(btrim(p_notes), ''),
      source = btrim(p_source),
      source_url = nullif(btrim(p_source_url), ''),
      source_date = p_source_date,
      data_status = p_data_status,
      archived_at = case when coalesce(p_archived, false) then coalesce(archived_at, now()) end
  where id = p_id
  returning id into v_id;
  if v_id is null then
    raise exception 'road segment not found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

-- No amount records the class as charged with an unknown tariff ("Sin dato").
create function public.admin_set_segment_toll(
  p_segment_id uuid,
  p_vehicle_class public.toll_vehicle_class,
  p_source text,
  p_valid_from date,
  p_data_status public.road_data_status,
  p_amount_cents bigint default null,
  p_source_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins edit the road catalog' using errcode = '42501';
  end if;
  if p_segment_id is null or p_vehicle_class is null or p_data_status is null then
    raise exception 'segment, vehicle class and data status are required' using errcode = '22023';
  end if;
  perform public.assert_road_source(p_source, nullif(btrim(p_source_url), ''), p_valid_from, 'valid_from');
  if not exists (select 1 from public.road_segments s where s.id = p_segment_id) then
    raise exception 'road segment not found' using errcode = 'P0002';
  end if;

  insert into public.road_segment_tolls (segment_id, vehicle_class, amount_cents, source, source_url, valid_from, data_status)
  values (p_segment_id, p_vehicle_class, p_amount_cents, btrim(p_source), nullif(btrim(p_source_url), ''),
          p_valid_from, p_data_status)
  on conflict (segment_id, vehicle_class, valid_from) do update
  set amount_cents = excluded.amount_cents,
      source = excluded.source,
      source_url = excluded.source_url,
      data_status = excluded.data_status;
end;
$$;

create function public.admin_upsert_segment_risk(
  p_segment_id uuid,
  p_level public.road_risk_level,
  p_from_hour smallint,
  p_to_hour smallint,
  p_description text,
  p_source text,
  p_observed_on date,
  p_data_status public.road_data_status,
  p_id uuid default null,
  p_source_url text default null,
  p_archived boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins edit the road catalog' using errcode = '42501';
  end if;
  if p_segment_id is null or p_level is null or p_data_status is null then
    raise exception 'segment, level and data status are required' using errcode = '22023';
  end if;
  if p_from_hour is null or p_to_hour is null or p_from_hour not between 0 and 23
     or p_to_hour not between 1 and 24 or p_from_hour = p_to_hour then
    raise exception 'invalid hour band' using errcode = '22023';
  end if;
  perform public.assert_road_source(p_source, nullif(btrim(p_source_url), ''), p_observed_on, 'observed_on');
  if p_observed_on > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'observed_on cannot be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from public.road_segments s where s.id = p_segment_id) then
    raise exception 'road segment not found' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.road_segment_risks (segment_id, level, from_hour, to_hour, description, source, source_url,
                                           observed_on, data_status, archived_at)
    values (p_segment_id, p_level, p_from_hour, p_to_hour, btrim(p_description), btrim(p_source),
            nullif(btrim(p_source_url), ''), p_observed_on, p_data_status,
            case when coalesce(p_archived, false) then now() end)
    returning id into v_id;
    return v_id;
  end if;

  update public.road_segment_risks
  set segment_id = p_segment_id,
      level = p_level,
      from_hour = p_from_hour,
      to_hour = p_to_hour,
      description = btrim(p_description),
      source = btrim(p_source),
      source_url = nullif(btrim(p_source_url), ''),
      observed_on = p_observed_on,
      data_status = p_data_status,
      archived_at = case when coalesce(p_archived, false) then coalesce(archived_at, now()) end
  where id = p_id
  returning id into v_id;
  if v_id is null then
    raise exception 'road risk not found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

create function public.admin_upsert_corridor(
  p_code text,
  p_name text,
  p_origin_city text,
  p_origin_state text,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_origin_radius_km numeric,
  p_destination_city text,
  p_destination_state text,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_destination_radius_km numeric,
  p_bidirectional boolean,
  p_segment_ids uuid[],
  p_id uuid default null,
  p_archived boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := coalesce(cardinality(p_segment_ids), 0);
  v_broken integer;
begin
  if not public.is_admin() then
    raise exception 'only admins edit the road catalog' using errcode = '42501';
  end if;
  if v_count = 0 or v_count > 100 then
    raise exception 'a corridor has between 1 and 100 segments' using errcode = '22023';
  end if;
  if array_position(p_segment_ids, null) is not null
     or (select count(distinct x) from unnest(p_segment_ids) x) <> v_count then
    raise exception 'segments must be distinct' using errcode = '22023';
  end if;
  if (select count(*) from public.road_segments s where s.id = any (p_segment_ids) and s.archived_at is null) <> v_count then
    raise exception 'unknown or archived segment' using errcode = '22023';
  end if;
  -- Consecutive segments must meet: each one ends in the city the next starts.
  select count(*) into v_broken
  from unnest(p_segment_ids) with ordinality a (segment_id, n)
  join unnest(p_segment_ids) with ordinality b (segment_id, n) on b.n = a.n + 1
  join public.road_segments sa on sa.id = a.segment_id
  join public.road_segments sb on sb.id = b.segment_id
  where lower(sa.to_city) <> lower(sb.from_city) or lower(sa.to_state) <> lower(sb.from_state);
  if v_broken > 0 then
    raise exception 'consecutive segments must connect' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.road_corridors (
      code, name, origin_city, origin_state, origin_lat, origin_lng, origin_radius_km,
      destination_city, destination_state, destination_lat, destination_lng, destination_radius_km,
      bidirectional, archived_at
    ) values (
      upper(btrim(p_code)), btrim(p_name), btrim(p_origin_city), btrim(p_origin_state), p_origin_lat, p_origin_lng,
      p_origin_radius_km, btrim(p_destination_city), btrim(p_destination_state), p_destination_lat,
      p_destination_lng, p_destination_radius_km, coalesce(p_bidirectional, true),
      case when coalesce(p_archived, false) then now() end
    )
    returning id into v_id;
  else
    update public.road_corridors
    set code = upper(btrim(p_code)),
        name = btrim(p_name),
        origin_city = btrim(p_origin_city),
        origin_state = btrim(p_origin_state),
        origin_lat = p_origin_lat,
        origin_lng = p_origin_lng,
        origin_radius_km = p_origin_radius_km,
        destination_city = btrim(p_destination_city),
        destination_state = btrim(p_destination_state),
        destination_lat = p_destination_lat,
        destination_lng = p_destination_lng,
        destination_radius_km = p_destination_radius_km,
        bidirectional = coalesce(p_bidirectional, true),
        archived_at = case when coalesce(p_archived, false) then coalesce(archived_at, now()) end
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'road corridor not found' using errcode = 'P0002';
    end if;
    -- The update above holds the corridor's row lock, so two admins do not
    -- interleave rewrites of its list.
    delete from public.road_corridor_segments where corridor_id = v_id;
  end if;

  insert into public.road_corridor_segments (corridor_id, seq, segment_id)
  select v_id, n::smallint, segment_id
  from unnest(p_segment_ids) with ordinality u (segment_id, n);
  return v_id;
end;
$$;

revoke all on function public.admin_upsert_road_segment(text, text, text, text, double precision, double precision,
  text, text, double precision, double precision, numeric, boolean, text, date, public.road_data_status, uuid, text,
  text, text, boolean) from public, anon;
grant execute on function public.admin_upsert_road_segment(text, text, text, text, double precision, double precision,
  text, text, double precision, double precision, numeric, boolean, text, date, public.road_data_status, uuid, text,
  text, text, boolean) to authenticated;
revoke all on function public.admin_set_segment_toll(uuid, public.toll_vehicle_class, text, date,
  public.road_data_status, bigint, text) from public, anon;
grant execute on function public.admin_set_segment_toll(uuid, public.toll_vehicle_class, text, date,
  public.road_data_status, bigint, text) to authenticated;
revoke all on function public.admin_upsert_segment_risk(uuid, public.road_risk_level, smallint, smallint, text,
  text, date, public.road_data_status, uuid, text, boolean) from public, anon;
grant execute on function public.admin_upsert_segment_risk(uuid, public.road_risk_level, smallint, smallint, text,
  text, date, public.road_data_status, uuid, text, boolean) to authenticated;
revoke all on function public.admin_upsert_corridor(text, text, text, text, double precision, double precision,
  numeric, text, text, double precision, double precision, numeric, boolean, uuid[], uuid, boolean) from public, anon;
grant execute on function public.admin_upsert_corridor(text, text, text, text, double precision, double precision,
  numeric, text, text, double precision, double precision, numeric, boolean, uuid[], uuid, boolean) to authenticated;
