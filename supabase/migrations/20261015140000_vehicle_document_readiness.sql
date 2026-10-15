-- B18 · Carrier onboarding and fleet: a unit with expired documents is not
-- available (docs/plan-v1.md, B18 acceptance).
--
--   * vehicle_missing_requirements(vehicle): required vehicle documents that
--     the unit does not have approved and unexpired (mirrors
--     company_missing_requirements from B03). Matching (B08) uses it to skip
--     units that are not ready.
--   * vehicle_expired_requirements(vehicle): the subset whose approved
--     document has expired. The app shows these units as "no disponible".
--   * set_vehicle_availability (B04) now refuses a unit with expired
--     documents. Same signature, privileges and checks otherwise.
--   * Changing an operator's email revokes its pending invitations: an
--     invitation is bound to the email it was sent to (D15).
--
-- Both helpers are security invoker: callers only see what RLS lets them see
-- (the carrier, its own units; an admin, any unit). No new tables.

create function public.vehicle_missing_requirements(p_vehicle_id uuid)
returns setof public.document_requirements
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.document_requirements r
  join public.vehicles v on v.id = p_vehicle_id
  join public.companies c on c.id = v.company_id
  where r.owner_type = 'vehicle'
    and r.is_required
    and r.archived_at is null
    and (r.company_type is null or r.company_type = c.type)
    and not exists (
      select 1
      from public.documents d
      where d.requirement_id = r.id
        and d.owner_type = 'vehicle'
        and d.owner_id = v.id
        and d.status = 'approved'
        and d.archived_at is null
        and (not r.requires_expiry or d.expires_at is not null)
        and (d.expires_at is null or d.expires_at > now())
    )
  order by r.sort_order, r.code;
$$;

revoke all on function public.vehicle_missing_requirements(uuid) from public, anon;
grant execute on function public.vehicle_missing_requirements(uuid) to authenticated, service_role;

-- A required document is expired when it has no current approved document
-- (vehicle_missing_requirements) and an active one that expired: marked
-- `expired` (e.g. by a future expiry job) or approved and past its date.
create function public.vehicle_expired_requirements(p_vehicle_id uuid)
returns setof public.document_requirements
language sql
stable
set search_path = ''
as $$
  select m.*
  from public.vehicle_missing_requirements(p_vehicle_id) m
  where exists (
    select 1
    from public.documents d
    where d.requirement_id = m.id
      and d.owner_type = 'vehicle'
      and d.owner_id = p_vehicle_id
      and d.archived_at is null
      and (d.status = 'expired' or (d.status = 'approved' and d.expires_at <= now()))
  )
  order by m.sort_order, m.code;
$$;

revoke all on function public.vehicle_expired_requirements(uuid) from public, anon;
grant execute on function public.vehicle_expired_requirements(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_vehicle_availability (B04) + expired-documents check.
-- ---------------------------------------------------------------------------
create or replace function public.set_vehicle_availability(
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
  v_expired text;
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

  -- Ownership was checked above, so reading the documents as definer is safe.
  select string_agg(e.code, ', ' order by e.sort_order, e.code) into v_expired
  from public.vehicle_expired_requirements(v_vehicle.id) e;
  if v_expired is not null then
    raise exception 'vehicle has expired documents: %', v_expired using errcode = '55000';
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

-- ---------------------------------------------------------------------------
-- Operator invitations are bound to the email they were sent to
-- (accept_operator_invitation compares it). When the carrier corrects the
-- email, pending invitations can never be accepted, so they are revoked and
-- the carrier issues a new one. security definer because clients have no
-- write privileges on operator_invitations; it only touches rows of the
-- updated operator.
-- ---------------------------------------------------------------------------
create function public.operators_revoke_invitations_on_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.operator_invitations
  set revoked_at = now()
  where operator_id = new.id and accepted_at is null and revoked_at is null;
  return new;
end;
$$;

revoke all on function public.operators_revoke_invitations_on_email_change() from public, anon, authenticated;

create trigger operators_revoke_invitations_on_email_change
after update of email on public.operators
for each row
when (old.email is distinct from new.email)
execute function public.operators_revoke_invitations_on_email_change();
