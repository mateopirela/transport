-- G1a.2 · Business units (D19, plan §G G1a).
--   A carrier company groups its units and operators in business units, each
--   run by one or more coordinators. The Gerente (manager) keeps exactly the
--   access of today, to the whole company; a Coordinador (coordinator) sees and
--   operates only the business units assigned to them.
--   This migration creates the tables, the business_unit_id of the fleet,
--   negotiations and trips (backfilled to one "Principal" unit per carrier),
--   the triggers that keep today's screens working, and the authorization
--   helpers. The next migrations rewrite the policies and the RPCs.

-- ---------------------------------------------------------------------------
-- Owner-operators (D13). Used by G2; added here so the seed can mark José.
-- ---------------------------------------------------------------------------
alter table public.companies add column is_owner_operator boolean not null default false;

comment on column public.companies.is_owner_operator is
  'A hombre-camión (D13): one person is the manager and the operator of the company.';

-- ---------------------------------------------------------------------------
-- business_units
-- ---------------------------------------------------------------------------
create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  -- Owned by the company. Units, operators, negotiations and trips still keep
  -- a company with rows from being deleted (their foreign keys restrict).
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint business_units_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint business_units_company_id_key unique (company_id, id)
);

comment on table public.business_units is
  'Business units (unidades de negocio) of a carrier company: the units and operators a coordinator runs (D19).';

create unique index business_units_company_name_key
  on public.business_units (company_id, lower(btrim(name)))
  where archived_at is null;

create trigger business_units_set_updated_at
before update on public.business_units
for each row execute function public.set_updated_at();

-- Only carrier companies have business units.
create function public.business_units_check_company()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.companies c where c.id = new.company_id and c.type = 'carrier') then
    raise exception 'business units belong to carrier companies' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.business_units_check_company() from public, anon, authenticated;

create trigger business_units_check_company
before insert or update of company_id on public.business_units
for each row execute function public.business_units_check_company();

-- ---------------------------------------------------------------------------
-- business_unit_coordinators
-- ---------------------------------------------------------------------------
create table public.business_unit_coordinators (
  business_unit_id uuid not null,
  company_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_unit_id, profile_id),
  constraint business_unit_coordinators_unit_fkey
    foreign key (company_id, business_unit_id) references public.business_units (company_id, id) on delete cascade
);

comment on table public.business_unit_coordinators is
  'Which coordinators run each business unit. A coordinator may run several.';

create index business_unit_coordinators_profile_idx on public.business_unit_coordinators (profile_id);

-- The profile must be a coordinator of the unit's company.
create function public.business_unit_coordinators_check_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.role = 'coordinator' and p.company_id = new.company_id
  ) then
    raise exception 'profile is not a coordinator of the company' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.business_unit_coordinators_check_profile() from public, anon, authenticated;

create trigger business_unit_coordinators_check_profile
before insert or update on public.business_unit_coordinators
for each row execute function public.business_unit_coordinators_check_profile();

-- ---------------------------------------------------------------------------
-- One "Principal" business unit per carrier company, now and for new ones.
-- ---------------------------------------------------------------------------
insert into public.business_units (company_id, name, created_by, created_at)
select c.id, 'Principal', c.created_by, c.created_at
from public.companies c
where c.type = 'carrier';

create function public.companies_create_default_business_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_units (company_id, name, created_by)
  values (new.id, 'Principal', new.created_by);
  return null;
end;
$$;

revoke all on function public.companies_create_default_business_unit() from public, anon, authenticated;

create trigger companies_create_default_business_unit
after insert on public.companies
for each row
when (new.type = 'carrier')
execute function public.companies_create_default_business_unit();

-- ---------------------------------------------------------------------------
-- business_unit_id of the fleet, negotiations and trips
-- ---------------------------------------------------------------------------
alter table public.vehicles add column business_unit_id uuid;
alter table public.operators add column business_unit_id uuid;
alter table public.negotiations add column business_unit_id uuid;
alter table public.trips add column business_unit_id uuid;

-- Backfill without firing the row triggers (updated_at, audit, availability):
-- nothing else changes.
alter table public.vehicles disable trigger user;
alter table public.operators disable trigger user;
alter table public.negotiations disable trigger user;
alter table public.trips disable trigger user;

update public.vehicles v set business_unit_id = b.id
from public.business_units b where b.company_id = v.company_id;
update public.operators o set business_unit_id = b.id
from public.business_units b where b.company_id = o.company_id;
update public.negotiations n set business_unit_id = b.id
from public.business_units b where b.company_id = n.carrier_company_id;
update public.trips t set business_unit_id = b.id
from public.business_units b where b.company_id = t.carrier_company_id;

alter table public.vehicles enable trigger user;
alter table public.operators enable trigger user;
alter table public.negotiations enable trigger user;
alter table public.trips enable trigger user;

alter table public.vehicles
  alter column business_unit_id set not null,
  add constraint vehicles_business_unit_fkey
    foreign key (company_id, business_unit_id) references public.business_units (company_id, id) on delete restrict;
alter table public.operators
  alter column business_unit_id set not null,
  add constraint operators_business_unit_fkey
    foreign key (company_id, business_unit_id) references public.business_units (company_id, id) on delete restrict;
alter table public.negotiations
  alter column business_unit_id set not null,
  add constraint negotiations_business_unit_fkey
    foreign key (carrier_company_id, business_unit_id) references public.business_units (company_id, id)
    on delete restrict;
alter table public.trips
  alter column business_unit_id set not null,
  add constraint trips_business_unit_fkey
    foreign key (carrier_company_id, business_unit_id) references public.business_units (company_id, id)
    on delete restrict;

create index vehicles_business_unit_idx on public.vehicles (business_unit_id);
create index operators_business_unit_idx on public.operators (business_unit_id);
create index negotiations_business_unit_idx on public.negotiations (business_unit_id);
create index trips_business_unit_idx on public.trips (business_unit_id);

comment on column public.vehicles.business_unit_id is 'Business unit that runs the unit (D19).';
comment on column public.operators.business_unit_id is 'Business unit the operator drives for (D19).';
comment on column public.negotiations.business_unit_id is
  'Business unit of the carrier that negotiates. One negotiation per load and company (negotiations_load_carrier_key).';
comment on column public.trips.business_unit_id is
  'Business unit that runs the trip: the one of the negotiation, then the one of the assigned unit.';

-- A client may choose the business unit of a new unit or operator; moving
-- them between business units is for the manager's screens (G4).
grant insert (business_unit_id) on table public.vehicles to authenticated;
grant insert (business_unit_id) on table public.operators to authenticated;

-- Today's screens do not send a business unit yet (until G4). When a row comes
-- without one, it gets the only one it can have: for a unit or an operator, the
-- only active business unit of the coordinator who adds it, or else of the
-- company; for a negotiation, the only active one of the company; for a trip,
-- the one of its negotiation. If there are several, the caller must choose.
create function public.default_business_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_units uuid[];
begin
  if new.business_unit_id is not null then
    return new;
  end if;

  if tg_table_name = 'trips' then
    select n.business_unit_id into new.business_unit_id
    from public.offers o
    join public.negotiations n on n.id = o.negotiation_id
    where o.id = new.offer_id;
  else
    -- A record cannot name a column only some of the four tables have.
    v_company_id := (
      to_jsonb(new) ->> case tg_table_name when 'negotiations' then 'carrier_company_id' else 'company_id' end
    )::uuid;

    if tg_table_name in ('vehicles', 'operators') and public.auth_role() = 'coordinator' then
      select array_agg(b.id) into v_units
      from public.business_unit_coordinators bc
      join public.business_units b on b.id = bc.business_unit_id and b.archived_at is null
      where bc.profile_id = (select auth.uid()) and bc.company_id = v_company_id;
    else
      select array_agg(b.id) into v_units
      from public.business_units b
      where b.company_id = v_company_id and b.archived_at is null;
    end if;

    if cardinality(v_units) = 1 then
      new.business_unit_id := v_units[1];
    end if;
  end if;

  -- Only the company's own staff (or the database owner, as in the seed) learn
  -- that a business unit is missing; anyone else gets the RLS error, as before.
  if new.business_unit_id is null
     and (tg_table_name in ('negotiations', 'trips')
          or (select auth.uid()) is null
          or public.auth_carrier_company_id() = v_company_id) then
    raise exception 'business_unit_id is required' using errcode = '23502';
  end if;
  return new;
end;
$$;

revoke all on function public.default_business_unit() from public, anon, authenticated;

create trigger vehicles_default_business_unit
before insert on public.vehicles
for each row execute function public.default_business_unit();
create trigger operators_default_business_unit
before insert on public.operators
for each row execute function public.default_business_unit();
create trigger negotiations_default_business_unit
before insert on public.negotiations
for each row execute function public.default_business_unit();
create trigger trips_default_business_unit
before insert on public.trips
for each row execute function public.default_business_unit();

-- A coordinator neither moves a unit or an operator to another business unit
-- nor archives it: both are the manager's (G4).
create function public.fleet_guard_business_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.auth_role() = 'coordinator'
     and (new.business_unit_id is distinct from old.business_unit_id
          or new.archived_at is distinct from old.archived_at) then
    raise exception 'only the manager can move or archive units and operators' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fleet_guard_business_unit() from public, anon, authenticated;

-- Named to sort first: triggers fire by name, and the caller is authorized
-- before vehicles_block_archive_with_trips and the others look at the row.
create trigger vehicles_authorize_business_unit
before update on public.vehicles
for each row execute function public.fleet_guard_business_unit();
create trigger operators_authorize_business_unit
before update on public.operators
for each row execute function public.fleet_guard_business_unit();

-- ---------------------------------------------------------------------------
-- Authorization helpers (plan §G.0). All read only the caller's own rows.
-- ---------------------------------------------------------------------------

-- The active carrier company of a manager or a coordinator; null otherwise.
create function public.auth_carrier_company_id()
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
    and p.role in ('manager', 'coordinator')
    and c.type = 'carrier'
    and c.archived_at is null;
$$;

-- True for the manager of an active carrier company.
create function public.auth_is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_fleet_company_id() is not null;
$$;

-- Manager: every active business unit of the company. Coordinator: the active
-- ones assigned to them. Anyone else: none.
create function public.auth_business_unit_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id order by b.id), '{}')
  from public.profiles p
  join public.companies c on c.id = p.company_id and c.type = 'carrier' and c.archived_at is null
  join public.business_units b on b.company_id = c.id and b.archived_at is null
  where p.id = (select auth.uid())
    and (
      p.role = 'manager'
      or (
        p.role = 'coordinator'
        and exists (
          select 1 from public.business_unit_coordinators bc
          where bc.business_unit_id = b.id and bc.profile_id = p.id
        )
      )
    );
$$;

-- Whether the caller operates a business unit: the manager, any of the
-- company (archived ones included, so nothing they reach today is lost); a
-- coordinator, the active ones assigned to them. Never null.
create function public.can_operate_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.business_units b
      where b.id = p_unit_id and b.company_id = public.auth_fleet_company_id()
    )
    or p_unit_id = any (public.auth_business_unit_ids()),
    false
  );
$$;

revoke all on function public.auth_carrier_company_id() from public, anon;
revoke all on function public.auth_is_manager() from public, anon;
revoke all on function public.auth_business_unit_ids() from public, anon;
revoke all on function public.can_operate_unit(uuid) from public, anon;
grant execute on function public.auth_carrier_company_id() to authenticated, service_role;
grant execute on function public.auth_is_manager() to authenticated, service_role;
grant execute on function public.auth_business_unit_ids() to authenticated, service_role;
grant execute on function public.can_operate_unit(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges and RLS of the new tables. Writes only by RPC (G4) or the seed.
-- ---------------------------------------------------------------------------
revoke all on table public.business_units from anon, authenticated;
revoke all on table public.business_unit_coordinators from anon, authenticated;
grant select on table public.business_units to authenticated;
grant select on table public.business_unit_coordinators to authenticated;

alter table public.business_units enable row level security;
alter table public.business_unit_coordinators enable row level security;

create policy business_units_select
on public.business_units
for select
to authenticated
using (
  company_id = (select public.auth_carrier_company_id())
  or (select public.is_admin())
);

create policy business_unit_coordinators_select
on public.business_unit_coordinators
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or profile_id = (select auth.uid())
  or (select public.is_admin())
);
