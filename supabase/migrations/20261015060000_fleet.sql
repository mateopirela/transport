-- B04 · Fleet: vehicles, operators, operator invitations, carrier routes and
-- vehicle availability.
--
-- Security model (same as B01):
--   * Every table has RLS; `anon` gets nothing and `authenticated` only the
--     column privileges it needs.
--   * A carrier (role `carrier`) manages only its own company's fleet. Every
--     fleet row carries `company_id`, and composite foreign keys
--     (company_id, id) guarantee that links between fleet rows never cross
--     companies, whatever a client sends.
--   * An operator sees its own operator row and the vehicles assigned to it.
--   * Operators join a carrier only through `accept_operator_invitation`
--     (D15); a carrier can register itself as its own operator (D13).
--   * Business rows are archived (`archived_at`), never deleted by clients.

-- ---------------------------------------------------------------------------
-- Enums (identifiers match packages/shared enums from B02)
-- ---------------------------------------------------------------------------
create type public.vehicle_kind as enum ('tractor', 'rigid', 'trailer');

create type public.unit_type as enum (
  'dry_van',
  'refrigerated',
  'flatbed',
  'lowboy',
  'hopper',
  'tanker',
  'container_chassis',
  'cage',
  'stake_bed',
  'torton',
  'rabon',
  'pickup_3_5t'
);

-- What a load may require and a vehicle may provide (vehicles.features).
create type public.special_requirement as enum (
  'temperature_control',
  'hazmat_permit',
  'liftgate',
  'tarp',
  'cargo_securing',
  'security_escort',
  'team_drivers',
  'extended_cargo_insurance',
  'loading_crew'
);

-- Federal driver's license types that allow moving freight (SICT).
create type public.license_type as enum ('B', 'C', 'E');

-- `manual`: set by the carrier. `trip_estimate`: derived from a trip's
-- estimated end of unloading (written by B06).
create type public.availability_source as enum ('manual', 'trip_estimate');

-- ---------------------------------------------------------------------------
-- Helper: the company whose fleet the caller manages, or null. Only users with
-- role `carrier` of an active carrier company manage a fleet; operators never
-- do. Used by RLS policies as `company_id = (select auth_fleet_company_id())`
-- so it is evaluated once per statement.
-- ---------------------------------------------------------------------------
create function public.auth_fleet_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = (select auth.uid())
    and p.role = 'carrier'
    and c.type = 'carrier'
    and c.archived_at is null;
$$;

revoke all on function public.auth_fleet_company_id() from public, anon;
grant execute on function public.auth_fleet_company_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- operators
-- ---------------------------------------------------------------------------
create table public.operators (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  -- Linked user. Null until the operator accepts an invitation; set to the
  -- carrier itself for an owner-operator ("hombre-camión", D13).
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null
    constraint operators_full_name_length check (char_length(btrim(full_name)) between 1 and 200),
  email text
    constraint operators_email_format check (
      email = lower(btrim(email)) and char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
  phone text constraint operators_phone_length check (char_length(phone) <= 32),
  license_number text constraint operators_license_number_length check (char_length(license_number) <= 30),
  license_type public.license_type,
  license_expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint operators_company_id_id_key unique (company_id, id)
);

comment on table public.operators is
  'Drivers of a carrier company. profile_id is set only by accept_operator_invitation or by the carrier itself (D13).';

create unique index operators_profile_id_key on public.operators (profile_id) where profile_id is not null;
create index operators_company_id_idx on public.operators (company_id) where archived_at is null;

create trigger operators_set_updated_at
before update on public.operators
for each row execute function public.set_updated_at();

-- The operator row of the caller, if any (used by vehicle policies).
create function public.auth_operator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id from public.operators o
  where o.profile_id = (select auth.uid()) and o.archived_at is null;
$$;

revoke all on function public.auth_operator_id() from public, anon;
grant execute on function public.auth_operator_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind public.vehicle_kind not null,
  plate text not null
    constraint vehicles_plate_format check (plate ~ '^[A-Z0-9]{5,8}$'),
  -- Fleet number the carrier uses internally ("número económico").
  fleet_number text constraint vehicles_fleet_number_length check (char_length(fleet_number) <= 30),
  model_year integer constraint vehicles_model_year_range check (model_year between 1950 and 2100),
  unit_type public.unit_type,
  capacity_kg integer constraint vehicles_capacity_kg_range check (capacity_kg between 1 and 80000),
  capacity_m3 numeric(6, 2) constraint vehicles_capacity_m3_range check (capacity_m3 > 0 and capacity_m3 <= 200),
  features public.special_requirement[] not null default '{}',
  -- Operator currently driving this unit; must belong to the same company.
  current_operator_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint vehicles_company_id_id_key unique (company_id, id),
  constraint vehicles_current_operator_fkey foreign key (company_id, current_operator_id)
    references public.operators (company_id, id) on delete restrict,
  -- Body and capacity belong to the unit that carries the cargo: required for
  -- rigid trucks and trailers, absent for tractors (mirrors vehicleFormSchema).
  constraint vehicles_body_matches_kind check (
    case kind
      when 'tractor' then unit_type is null and capacity_kg is null and capacity_m3 is null
      else unit_type is not null and capacity_kg is not null
    end
  )
);

comment on table public.vehicles is 'Tractors, rigid trucks and trailers of a carrier company.';

-- A plate is registered once per company among active units. Uniqueness is
-- per company on purpose: a global index would let any carrier probe which
-- plates other companies have registered.
create unique index vehicles_company_plate_key on public.vehicles (company_id, plate) where archived_at is null;
create index vehicles_company_id_idx on public.vehicles (company_id) where archived_at is null;
create index vehicles_current_operator_id_idx on public.vehicles (current_operator_id)
  where current_operator_id is not null;

create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

-- Archived units drop their operator; only active operators can be assigned.
--
-- The operator row is read FOR SHARE, which conflicts with the row lock taken
-- by an update that archives it, so an assignment and an archival of the same
-- operator serialize: if the archival commits first, the assignment re-reads
-- the archived row and fails; if the assignment commits first, the archival's
-- operators_release_vehicles (a later statement, with a newer snapshot) sees it
-- and clears it. Either way no unit stays assigned to an archived operator.
create function public.vehicles_check_operator()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  if new.archived_at is not null then
    new.current_operator_id := null;
  elsif new.current_operator_id is not null
        and (tg_op = 'INSERT' or new.current_operator_id is distinct from old.current_operator_id) then
    select o.archived_at into v_archived_at
    from public.operators o
    where o.id = new.current_operator_id
    for share;
    if v_archived_at is not null then
      raise exception 'cannot assign an archived operator' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.vehicles_check_operator() from public, anon, authenticated;

create trigger vehicles_check_operator
before insert or update on public.vehicles
for each row execute function public.vehicles_check_operator();

-- Archiving an operator unassigns it from every unit.
create function public.operators_release_vehicles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.vehicles set current_operator_id = null where current_operator_id = new.id;
  return new;
end;
$$;

revoke all on function public.operators_release_vehicles() from public, anon, authenticated;

create trigger operators_release_vehicles
after update of archived_at on public.operators
for each row
when (old.archived_at is null and new.archived_at is not null)
execute function public.operators_release_vehicles();

-- ---------------------------------------------------------------------------
-- operator_invitations (D15): single-use code, bound to the operator's email,
-- with expiration. Only the SHA-256 of the code is stored.
-- ---------------------------------------------------------------------------
create table public.operator_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  operator_id uuid not null,
  email text not null constraint operator_invitations_email_lower check (email = lower(btrim(email))),
  code_hash bytea not null,
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  constraint operator_invitations_operator_fkey foreign key (company_id, operator_id)
    references public.operators (company_id, id) on delete cascade,
  constraint operator_invitations_single_outcome check (accepted_at is null or revoked_at is null)
);

comment on table public.operator_invitations is
  'Single-use invitations for operators. Created, revoked and accepted only through RPCs.';

create unique index operator_invitations_code_hash_key on public.operator_invitations (code_hash);
create index operator_invitations_operator_id_idx on public.operator_invitations (operator_id);

-- ---------------------------------------------------------------------------
-- carrier_routes: usual routes of a carrier ("rutas habituales").
-- ---------------------------------------------------------------------------
create table public.carrier_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  origin_city text not null constraint carrier_routes_origin_city_length check (char_length(btrim(origin_city)) between 1 and 120),
  origin_state text not null constraint carrier_routes_origin_state_length check (char_length(btrim(origin_state)) between 1 and 60),
  origin_location extensions.geography(Point, 4326),
  destination_city text not null constraint carrier_routes_destination_city_length check (char_length(btrim(destination_city)) between 1 and 120),
  destination_state text not null constraint carrier_routes_destination_state_length check (char_length(btrim(destination_state)) between 1 and 60),
  destination_location extensions.geography(Point, 4326),
  -- Unit types the carrier usually runs on this route (empty = any).
  unit_types public.unit_type[] not null default '{}',
  notes text constraint carrier_routes_notes_length check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.carrier_routes is 'Usual routes of a carrier company.';

create index carrier_routes_company_id_idx on public.carrier_routes (company_id) where archived_at is null;

create trigger carrier_routes_set_updated_at
before update on public.carrier_routes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vehicle_availability: where and from when a unit is free. One active row
-- per vehicle; replaced rows are archived and kept as history (D11).
-- ---------------------------------------------------------------------------
create table public.vehicle_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  vehicle_id uuid not null,
  available_from timestamptz not null,
  location extensions.geography(Point, 4326) not null,
  city text not null constraint vehicle_availability_city_length check (char_length(btrim(city)) between 1 and 120),
  state text not null constraint vehicle_availability_state_length check (char_length(btrim(state)) between 1 and 60),
  source public.availability_source not null default 'manual',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint vehicle_availability_vehicle_fkey foreign key (company_id, vehicle_id)
    references public.vehicles (company_id, id) on delete restrict
);

comment on table public.vehicle_availability is
  'Where and from when each unit is free. Written only through set_vehicle_availability (and B06 trip events).';

create unique index vehicle_availability_active_key on public.vehicle_availability (vehicle_id)
  where archived_at is null;
create index vehicle_availability_company_id_idx on public.vehicle_availability (company_id)
  where archived_at is null;
create index vehicle_availability_location_idx on public.vehicle_availability using gist (location)
  where archived_at is null;

-- Archiving a unit also ends its active availability, so it is never offered
-- for matching. security definer because clients have no write privileges on
-- vehicle_availability; it only touches rows of the archived vehicle.
create function public.vehicles_end_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.vehicle_availability
  set archived_at = now()
  where vehicle_id = new.id and archived_at is null;
  return new;
end;
$$;

revoke all on function public.vehicles_end_availability() from public, anon, authenticated;

create trigger vehicles_end_availability
after update of archived_at on public.vehicles
for each row
when (old.archived_at is null and new.archived_at is not null)
execute function public.vehicles_end_availability();

-- ---------------------------------------------------------------------------
-- RPC: create (or re-issue) an invitation for one of the carrier's operators.
-- Returns the plain code once; any previous pending invitation is revoked.
-- ---------------------------------------------------------------------------
create function public.create_operator_invitation(p_operator_id uuid, p_valid_for_hours integer default 168)
returns table (invitation_id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- Crockford base32 (no I, L, O, U): easy to read aloud and type.
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_uid uuid := (select auth.uid());
  v_operator public.operators%rowtype;
  v_bytes bytea;
  v_code text := '';
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_valid_for_hours is null or p_valid_for_hours not between 1 and 720 then
    raise exception 'p_valid_for_hours must be between 1 and 720' using errcode = '22023';
  end if;

  -- Lock order (shared with accept_operator_invitation): operator, then its
  -- invitations.
  select * into v_operator from public.operators where id = p_operator_id for update;
  if not found or v_operator.company_id is distinct from public.auth_fleet_company_id() then
    raise exception 'operator not found' using errcode = '42501';
  end if;
  if v_operator.archived_at is not null then
    raise exception 'operator is archived' using errcode = '22023';
  end if;
  if v_operator.profile_id is not null then
    raise exception 'operator already has an account' using errcode = '22023';
  end if;
  if v_operator.email is null then
    raise exception 'operator has no email' using errcode = '22023';
  end if;

  -- 16 characters x 5 bits = 80 bits of entropy (256 is a multiple of 32, so
  -- the modulo is unbiased).
  v_bytes := extensions.gen_random_bytes(16);
  for i in 0..15 loop
    v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  update public.operator_invitations
  set revoked_at = now()
  where operator_id = v_operator.id and accepted_at is null and revoked_at is null;

  v_expires_at := now() + make_interval(hours => p_valid_for_hours);

  insert into public.operator_invitations (company_id, operator_id, email, code_hash, expires_at, created_by)
  values (v_operator.company_id, v_operator.id, v_operator.email, sha256(convert_to(v_code, 'UTF8')), v_expires_at, v_uid)
  returning id into v_invitation_id;

  return query select v_invitation_id, v_code, v_expires_at;
end;
$$;

revoke all on function public.create_operator_invitation(uuid, integer) from public, anon;
grant execute on function public.create_operator_invitation(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: revoke a pending invitation of the caller's company.
-- ---------------------------------------------------------------------------
create function public.revoke_operator_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.operator_invitations%rowtype;
begin
  select * into v_invitation from public.operator_invitations where id = p_invitation_id for update;
  if not found or v_invitation.company_id is distinct from public.auth_fleet_company_id() then
    raise exception 'invitation not found' using errcode = '42501';
  end if;
  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null then
    raise exception 'invitation is no longer pending' using errcode = '22023';
  end if;

  update public.operator_invitations set revoked_at = now() where id = p_invitation_id;
end;
$$;

revoke all on function public.revoke_operator_invitation(uuid) from public, anon;
grant execute on function public.revoke_operator_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: accept an invitation (D15). The caller signed up with role `operator`
-- and the same (confirmed) email the invitation was sent to; the code is
-- single-use and must not be expired or revoked. Links the caller's profile to
-- the carrier company and to the operator row. Returns the operator id.
-- ---------------------------------------------------------------------------
create function public.accept_operator_invitation(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_email text;
  v_email_confirmed_at timestamptz;
  v_invitation public.operator_invitations%rowtype;
  v_operator_id uuid;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.role <> 'operator' then
    raise exception 'only operator accounts can accept invitations' using errcode = '42501';
  end if;
  if v_profile.company_id is not null then
    raise exception 'user already belongs to a company' using errcode = '42501';
  end if;

  -- Lock order shared with create_operator_invitation: the operator row first,
  -- then its invitation, so a concurrent re-issue cannot deadlock with this.
  -- An invitation's operator_id never changes, so it can be read unlocked.
  select i.operator_id into v_operator_id
  from public.operator_invitations i
  where i.code_hash = sha256(convert_to(v_code, 'UTF8'));
  if found then
    perform 1 from public.operators o where o.id = v_operator_id for update;
  end if;

  select * into v_invitation
  from public.operator_invitations
  where code_hash = sha256(convert_to(v_code, 'UTF8'))
  for update;

  -- Same error for unknown, used, revoked and expired codes.
  if not found
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now() then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_email_confirmed_at
  from auth.users u where u.id = v_uid;
  if v_email is distinct from v_invitation.email or v_email_confirmed_at is null then
    raise exception 'invitation was sent to another email' using errcode = '42501';
  end if;

  -- The operator row may have been archived or linked since the invitation.
  update public.operators
  set profile_id = v_uid
  where id = v_invitation.operator_id and profile_id is null and archived_at is null;
  if not found then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  update public.profiles set company_id = v_invitation.company_id where id = v_uid;

  update public.operator_invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invitation.id;

  return v_invitation.operator_id;
end;
$$;

revoke all on function public.accept_operator_invitation(text) from public, anon;
grant execute on function public.accept_operator_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: set where and from when a unit is free. Archives the previous active
-- availability of the unit and inserts the new one atomically.
-- ---------------------------------------------------------------------------
create function public.set_vehicle_availability(
  p_vehicle_id uuid,
  p_available_from timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_city text,
  p_state text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Lock the vehicle so concurrent calls serialize on it.
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or v_vehicle.company_id is distinct from public.auth_fleet_company_id() then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;
  if v_vehicle.archived_at is not null then
    raise exception 'vehicle is archived' using errcode = '22023';
  end if;
  if p_available_from is null then
    raise exception 'p_available_from is required' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  update public.vehicle_availability
  set archived_at = now()
  where vehicle_id = v_vehicle.id and archived_at is null;

  insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source, created_by)
  values (
    v_vehicle.company_id,
    v_vehicle.id,
    p_available_from,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    btrim(p_city),
    btrim(p_state),
    'manual',
    (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.set_vehicle_availability(uuid, timestamptz, double precision, double precision, text, text)
  from public, anon;
grant execute on function public.set_vehicle_availability(uuid, timestamptz, double precision, double precision, text, text)
  to authenticated;

-- RPC: mark a unit as not available (archives its active availability).
create function public.clear_vehicle_availability(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
begin
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or v_vehicle.company_id is distinct from public.auth_fleet_company_id() then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;

  update public.vehicle_availability
  set archived_at = now()
  where vehicle_id = v_vehicle.id and archived_at is null;
end;
$$;

revoke all on function public.clear_vehicle_availability(uuid) from public, anon;
grant execute on function public.clear_vehicle_availability(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on table public.operators from anon, authenticated;
revoke all on table public.vehicles from anon, authenticated;
revoke all on table public.operator_invitations from anon, authenticated;
revoke all on table public.carrier_routes from anon, authenticated;
revoke all on table public.vehicle_availability from anon, authenticated;

grant select on table public.operators to authenticated;
-- Clients may supply their own uuid (e.g. to create rows offline and retry safely).
grant insert (id, company_id, profile_id, full_name, email, phone, license_number, license_type, license_expires_on)
  on table public.operators to authenticated;
-- profile_id is not updatable: it changes only through accept_operator_invitation.
grant update (full_name, email, phone, license_number, license_type, license_expires_on, archived_at)
  on table public.operators to authenticated;

grant select on table public.vehicles to authenticated;
grant insert (id, company_id, kind, plate, fleet_number, model_year, unit_type, capacity_kg, capacity_m3, features, current_operator_id)
  on table public.vehicles to authenticated;
grant update (plate, fleet_number, model_year, unit_type, capacity_kg, capacity_m3, features, current_operator_id, archived_at)
  on table public.vehicles to authenticated;

-- The code hash is never readable by clients.
grant select (id, company_id, operator_id, email, expires_at, created_by, created_at, accepted_at, accepted_by, revoked_at)
  on table public.operator_invitations to authenticated;

grant select on table public.carrier_routes to authenticated;
grant insert (id, company_id, origin_city, origin_state, origin_location, destination_city, destination_state,
              destination_location, unit_types, notes)
  on table public.carrier_routes to authenticated;
grant update (origin_city, origin_state, origin_location, destination_city, destination_state,
              destination_location, unit_types, notes, archived_at)
  on table public.carrier_routes to authenticated;

grant select on table public.vehicle_availability to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security. No delete policies: rows are archived.
-- ---------------------------------------------------------------------------
alter table public.operators enable row level security;
alter table public.vehicles enable row level security;
alter table public.operator_invitations enable row level security;
alter table public.carrier_routes enable row level security;
alter table public.vehicle_availability enable row level security;

-- operators: the carrier's fleet managers, the operator itself, admins.
create policy operators_select
on public.operators
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or profile_id = (select auth.uid())
  or (select public.is_admin())
);

-- A carrier may only link a new operator row to itself (D13); invited
-- operators are linked by accept_operator_invitation.
create policy operators_insert
on public.operators
for insert
to authenticated
with check (
  company_id = (select public.auth_fleet_company_id())
  and (profile_id is null or profile_id = (select auth.uid()))
);

create policy operators_update
on public.operators
for update
to authenticated
using (company_id = (select public.auth_fleet_company_id()))
with check (company_id = (select public.auth_fleet_company_id()));

-- vehicles: the carrier's fleet managers, the assigned operator, admins.
create policy vehicles_select
on public.vehicles
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or (current_operator_id is not null and current_operator_id = (select public.auth_operator_id()))
  or (select public.is_admin())
);

create policy vehicles_insert
on public.vehicles
for insert
to authenticated
with check (company_id = (select public.auth_fleet_company_id()));

create policy vehicles_update
on public.vehicles
for update
to authenticated
using (company_id = (select public.auth_fleet_company_id()))
with check (company_id = (select public.auth_fleet_company_id()));

-- operator_invitations: read-only for the carrier and admins; writes via RPC.
create policy operator_invitations_select
on public.operator_invitations
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or (select public.is_admin())
);

-- carrier_routes: managed by the carrier; admins read.
create policy carrier_routes_select
on public.carrier_routes
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or (select public.is_admin())
);

create policy carrier_routes_insert
on public.carrier_routes
for insert
to authenticated
with check (company_id = (select public.auth_fleet_company_id()));

create policy carrier_routes_update
on public.carrier_routes
for update
to authenticated
using (company_id = (select public.auth_fleet_company_id()))
with check (company_id = (select public.auth_fleet_company_id()));

-- vehicle_availability: read by the carrier and admins; writes via RPC.
create policy vehicle_availability_select
on public.vehicle_availability
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- Documents (B03) for vehicles and operators: B03 left
-- document_owner_company_id() accepting only company owners until the fleet
-- tables existed. Same signature, privileges and behavior for companies.
-- ---------------------------------------------------------------------------
create or replace function public.document_owner_company_id(
  p_owner_type public.document_owner_type,
  p_owner_id uuid
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  case p_owner_type
    when 'company' then
      return (select c.id from public.companies c where c.id = p_owner_id);
    when 'vehicle' then
      return (select v.company_id from public.vehicles v where v.id = p_owner_id);
    when 'operator' then
      return (select o.company_id from public.operators o where o.id = p_owner_id);
  end case;
end;
$$;
