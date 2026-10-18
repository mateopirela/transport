-- G4 · The manager's "Mi empresa" (plan §G G4, D19).
--   RPCs, only for the Gerente (auth_fleet_company_id), to organize the
--   company: business units, which coordinators run them, removing a
--   coordinator, and moving units and operators between business units.
--   Archiving units and operators is still the archived_at update of B06,
--   which fleet_guard_business_unit (G1a) already keeps for the Gerente.
--   No new tables: the RPCs write business_units, business_unit_coordinators,
--   profiles, vehicles, operators and invitations, and check the company.
--
--   Lock orders (shared with assign_trip, F5, and the invitation RPCs, G1b/G2):
--     * an operator, then units by id (assign_trip, operators_release_vehicles);
--     * an operator, then its invitations (create_invitation, redeem);
--     * invitations, then business units (redeem and accept insert rows that
--       reference a business unit after locking their invitation);
--     * a profile, then business units (accept_coordinator_invitation);
--     * a profile, then its invitations (create_invitation through
--       invitations_require_member_creator, and remove_company_member);
--     * a load, then the unit it proposes (make_offer, assert_vehicle_in_unit).

-- ---------------------------------------------------------------------------
-- Nothing is added to or moved into an archived business unit.
-- ---------------------------------------------------------------------------

-- The row lock (FOR SHARE) conflicts with the FOR UPDATE of
-- archive_business_unit: a unit, operator or negotiation added to (or moved
-- into) a business unit while it is being archived waits for the archive and
-- then sees it archived; if it commits first, the archive sees it and fails.
create function public.require_active_business_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.business_unit_id is not distinct from old.business_unit_id then
    return new;
  end if;
  select b.archived_at into v_archived_at
  from public.business_units b
  where b.id = new.business_unit_id
  for share;
  if found and v_archived_at is not null then
    raise exception 'business unit is archived' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.require_active_business_unit() from public, anon, authenticated;

-- Named after *_default_business_unit (triggers fire by name), so a row that
-- comes without a business unit gets it first.
create trigger vehicles_require_active_business_unit
before insert or update of business_unit_id on public.vehicles
for each row execute function public.require_active_business_unit();
create trigger operators_require_active_business_unit
before insert or update of business_unit_id on public.operators
for each row execute function public.require_active_business_unit();
create trigger negotiations_require_active_business_unit
before insert or update of business_unit_id on public.negotiations
for each row execute function public.require_active_business_unit();

-- ---------------------------------------------------------------------------
-- An offer and a move of its unit serialize on the unit's row.
-- ---------------------------------------------------------------------------

-- Same as 20261026020200_business_unit_rpcs.sql, but the unit is read FOR
-- SHARE (so the function is volatile now): it conflicts with the FOR UPDATE
-- of move_vehicle_to_unit. An offer that proposes a unit being moved waits
-- for the move and then sees its new business unit (and fails); a move that
-- comes second waits for the offer and then sees it pending (and fails).
-- make_offer and the counter-offers already lock the load first: load, then
-- unit, as everywhere else.
create or replace function public.assert_vehicle_in_unit(p_vehicle_id uuid, p_business_unit_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_vehicle_id is not null then
    perform 1 from public.vehicles v
    where v.id = p_vehicle_id and v.business_unit_id = p_business_unit_id
    for share;
    if not found then
      raise exception 'invalid offer: vehicle not found' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function public.assert_vehicle_in_unit(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- An invitation is issued only by a current member of its company.
-- ---------------------------------------------------------------------------

-- create_invitation reads the caller's company without a lock. This trigger
-- locks the creator's profile FOR SHARE and checks it again, against the FOR
-- UPDATE of remove_company_member: an invitation issued while its coordinator
-- is removed either waits and fails, or commits first and is then revoked by
-- the removal. Lock order: (operator,) profile, then the new invitation;
-- remove_company_member takes the profile, then the invitations.
-- Invoker rights: invitations are only inserted by create_invitation (as its
-- owner) and the service role.
create function public.invitations_require_member_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is null then
    return new;
  end if;
  perform 1 from public.profiles p
  where p.id = new.created_by and p.company_id = new.company_id
  for share;
  if not found then
    raise exception 'only the staff of a carrier company can invite' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.invitations_require_member_creator() from public, anon, authenticated;

create trigger invitations_require_member_creator
before insert on public.invitations
for each row execute function public.invitations_require_member_creator();

-- ---------------------------------------------------------------------------
-- The caller's company, only for its Gerente. Called by the RPCs below (as
-- their owner); clients cannot call it.
-- ---------------------------------------------------------------------------
create function public.require_manager_company_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_company_id uuid := public.auth_fleet_company_id();
begin
  if v_company_id is null then
    raise exception 'only the manager can manage the company' using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;

revoke all on function public.require_manager_company_id() from public, anon, authenticated;

-- A business unit name: trimmed, 1 to 80 characters (business_units_name_length).
create function public.business_unit_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'business unit name must be 1 to 80 characters' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

revoke all on function public.business_unit_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create a business unit. A name already used by an active business
-- unit of the company fails with business_units_company_name_key (23505).
-- ---------------------------------------------------------------------------
create function public.create_business_unit(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.require_manager_company_id();
  v_id uuid;
begin
  insert into public.business_units (company_id, name, created_by)
  values (v_company_id, public.business_unit_name(p_name), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: rename an active business unit of the company.
-- ---------------------------------------------------------------------------
create function public.rename_business_unit(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.require_manager_company_id();
  v_name text := public.business_unit_name(p_name);
begin
  update public.business_units
  set name = v_name
  where id = p_id and company_id = v_company_id and archived_at is null;
  if not found then
    raise exception 'business unit not found' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: archive a business unit. It must be empty: no active units or
-- operators, no negotiation with a pending offer and no trip that is not
-- closed or cancelled. The company keeps at least one active business unit
-- (D19). Its coordinators lose it, and the pending invitations to it are
-- revoked (they could no longer be redeemed anyway).
-- ---------------------------------------------------------------------------
create function public.archive_business_unit(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.require_manager_company_id();
  v_archived_at timestamptz;
begin
  if not exists (select 1 from public.business_units b where b.id = p_id and b.company_id = v_company_id) then
    raise exception 'business unit not found' using errcode = '42501';
  end if;

  -- Invitations before business units (see the lock orders above).
  perform 1 from public.invitations i
  where i.company_id = v_company_id and p_id = any (i.business_unit_ids)
    and i.accepted_at is null and i.revoked_at is null
  order by i.id
  for update;
  -- Every active business unit of the company, by id: two archives of the
  -- company's last two business units serialize, and the second sees one left.
  perform 1 from public.business_units b
  where b.company_id = v_company_id and (b.archived_at is null or b.id = p_id)
  order by b.id
  for update;

  select b.archived_at into v_archived_at from public.business_units b where b.id = p_id;
  if v_archived_at is not null then
    raise exception 'business unit not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_units b
    where b.company_id = v_company_id and b.archived_at is null and b.id <> p_id
  ) then
    raise exception 'cannot archive the only business unit' using errcode = '55000';
  end if;
  if exists (select 1 from public.vehicles v where v.business_unit_id = p_id and v.archived_at is null)
     or exists (select 1 from public.operators o where o.business_unit_id = p_id and o.archived_at is null) then
    raise exception 'business unit has active units or operators' using errcode = '55000';
  end if;
  if exists (
       select 1 from public.negotiations n
       join public.offers o on o.negotiation_id = n.id
       where n.business_unit_id = p_id and o.status = 'pending'
     )
     or exists (
       select 1 from public.trips t
       where t.business_unit_id = p_id and t.status not in ('closed', 'cancelled')
     ) then
    raise exception 'business unit has open negotiations or trips' using errcode = '55000';
  end if;

  update public.business_units set archived_at = now() where id = p_id;
  delete from public.business_unit_coordinators where business_unit_id = p_id;
  update public.invitations
  set revoked_at = now()
  where company_id = v_company_id and p_id = any (business_unit_ids)
    and accepted_at is null and revoked_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: the business units a coordinator of the company runs (one or more),
-- replacing the previous ones.
-- ---------------------------------------------------------------------------
create function public.set_coordinator_units(p_profile_id uuid, p_unit_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.require_manager_company_id();
  v_units uuid[];
  v_locked integer;
begin
  select coalesce(array_agg(distinct u order by u), '{}') into v_units
  from unnest(p_unit_ids) u where u is not null;
  if cardinality(v_units) = 0 then
    raise exception 'at least one business unit is required' using errcode = '22023';
  end if;

  -- The profile, then the business units (as accept_coordinator_invitation).
  perform 1 from public.profiles p
  where p.id = p_profile_id and p.company_id = v_company_id and p.role = 'coordinator'
  for update;
  if not found then
    raise exception 'coordinator not found' using errcode = '42501';
  end if;
  with locked as (
    select b.id from public.business_units b
    where b.id = any (v_units) and b.company_id = v_company_id and b.archived_at is null
    order by b.id
    for share
  )
  select count(*) into v_locked from locked;
  if v_locked <> cardinality(v_units) then
    raise exception 'business unit not found' using errcode = '42501';
  end if;

  delete from public.business_unit_coordinators bc
  where bc.profile_id = p_profile_id and not (bc.business_unit_id = any (v_units));
  insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id, created_by)
  select u, v_company_id, p_profile_id, (select auth.uid())
  from unnest(v_units) u
  on conflict (business_unit_id, profile_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: remove a coordinator from the company. They lose their business units
-- and their company at once (every policy reads the profile); their messages
-- and trip events stay. The pending invitations they issued are revoked.
-- Not for managers, operators (archive the operator instead) or oneself.
-- ---------------------------------------------------------------------------
create function public.remove_company_member(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.require_manager_company_id();
  v_role public.user_role;
begin
  if p_profile_id = (select auth.uid()) then
    raise exception 'cannot remove yourself' using errcode = '42501';
  end if;
  select p.role into v_role
  from public.profiles p
  where p.id = p_profile_id and p.company_id = v_company_id
  for update;
  if not found then
    raise exception 'coordinator not found' using errcode = '42501';
  end if;
  if v_role <> 'coordinator' then
    raise exception 'only coordinators can be removed' using errcode = '42501';
  end if;

  update public.invitations
  set revoked_at = now()
  where company_id = v_company_id and created_by = p_profile_id
    and accepted_at is null and revoked_at is null;
  delete from public.business_unit_coordinators where profile_id = p_profile_id;
  update public.profiles set company_id = null where id = p_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: move a unit to another business unit of the company. Refused while
-- the unit is committed: assigned to a trip that is not over
-- (trip_in_operator_hands), offered for a trip waiting for its assignment
-- (vehicle_committing_trip), or proposed in a pending offer. Its operator
-- stays only if they drive for the new business unit.
-- ---------------------------------------------------------------------------
create function public.move_vehicle_to_unit(p_vehicle_id uuid, p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.require_manager_company_id();
  v_vehicle public.vehicles;
begin
  select * into v_vehicle from public.vehicles v
  where v.id = p_vehicle_id and v.company_id = v_company_id
  for update;
  if not found then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;
  if v_vehicle.archived_at is not null then
    raise exception 'vehicle is archived' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.business_units b
    where b.id = p_unit_id and b.company_id = v_company_id and b.archived_at is null
  ) then
    raise exception 'business unit not found' using errcode = '42501';
  end if;
  if v_vehicle.business_unit_id = p_unit_id then
    return;
  end if;
  if exists (
       select 1 from public.trips t
       where t.vehicle_id = p_vehicle_id and public.trip_in_operator_hands(t.status)
     )
     or public.vehicle_committing_trip(p_vehicle_id, null) is not null
     or exists (select 1 from public.offers o where o.vehicle_id = p_vehicle_id and o.status = 'pending') then
    raise exception 'cannot move: it is committed to a trip' using errcode = '55000';
  end if;

  update public.vehicles v
  set business_unit_id = p_unit_id,
      current_operator_id = case
        when exists (
          select 1 from public.operators o
          where o.id = v.current_operator_id and o.business_unit_id = p_unit_id
        ) then v.current_operator_id
      end
  where v.id = p_vehicle_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: move an operator to another business unit of the company. Refused
-- while a trip that is not over is in their hands. They stop driving the
-- units of other business units, and their pending invitation links are
-- revoked (they named the old business unit).
-- ---------------------------------------------------------------------------
create function public.move_operator_to_unit(p_operator_id uuid, p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.require_manager_company_id();
  v_operator public.operators;
begin
  select * into v_operator from public.operators o
  where o.id = p_operator_id and o.company_id = v_company_id
  for update;
  if not found then
    raise exception 'operator not found' using errcode = '42501';
  end if;
  if v_operator.archived_at is not null then
    raise exception 'operator is archived' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.business_units b
    where b.id = p_unit_id and b.company_id = v_company_id and b.archived_at is null
  ) then
    raise exception 'business unit not found' using errcode = '42501';
  end if;
  if v_operator.business_unit_id = p_unit_id then
    return;
  end if;
  if exists (
    select 1 from public.trips t
    where t.operator_id = p_operator_id and public.trip_in_operator_hands(t.status)
  ) then
    raise exception 'cannot move: it is committed to a trip' using errcode = '55000';
  end if;

  -- The operator, then units by id (assign_trip), then invitations.
  perform 1 from public.vehicles v
  where v.current_operator_id = p_operator_id and v.business_unit_id <> p_unit_id
  order by v.id
  for update;
  update public.vehicles
  set current_operator_id = null
  where current_operator_id = p_operator_id and business_unit_id <> p_unit_id;

  update public.invitations
  set revoked_at = now()
  where operator_id = p_operator_id and accepted_at is null and revoked_at is null;

  update public.operators set business_unit_id = p_unit_id where id = p_operator_id;
end;
$$;

revoke all on function public.create_business_unit(text) from public, anon;
revoke all on function public.rename_business_unit(uuid, text) from public, anon;
revoke all on function public.archive_business_unit(uuid) from public, anon;
revoke all on function public.set_coordinator_units(uuid, uuid[]) from public, anon;
revoke all on function public.remove_company_member(uuid) from public, anon;
revoke all on function public.move_vehicle_to_unit(uuid, uuid) from public, anon;
revoke all on function public.move_operator_to_unit(uuid, uuid) from public, anon;
grant execute on function public.create_business_unit(text) to authenticated;
grant execute on function public.rename_business_unit(uuid, text) to authenticated;
grant execute on function public.archive_business_unit(uuid) to authenticated;
grant execute on function public.set_coordinator_units(uuid, uuid[]) to authenticated;
grant execute on function public.remove_company_member(uuid) to authenticated;
grant execute on function public.move_vehicle_to_unit(uuid, uuid) to authenticated;
grant execute on function public.move_operator_to_unit(uuid, uuid) to authenticated;
