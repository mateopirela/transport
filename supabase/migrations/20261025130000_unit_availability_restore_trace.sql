-- F13 · Trace of a restored availability (follow-up of F5,
-- 20261021000000_unit_availability_restore.sql):
--   The row restore_vehicle_availability writes copies the one it restores,
--   created_by included (who set that availability, or whose trip event
--   estimated it), so nothing said that it was a restoration nor what caused
--   it. Two bookkeeping columns now say so: the row it copies and the trip
--   whose cancellation or reassignment gave the unit its availability back
--   (who did that is on the trip's events). Same behavior otherwise: what is
--   restored, when, and created_by are unchanged.

alter table public.vehicle_availability
  add column restored_from_id uuid,
  add column restored_by_trip_id uuid;

-- No foreign keys on purpose, like ended_by_trip_id: their checks would lock
-- the trip (and the copied row) while the unit lock is held, in the opposite
-- order to the trip RPCs. Both are only a trace; neither row is ever deleted.
comment on column public.vehicle_availability.restored_from_id is
  'For a row restored when a commitment of the unit went away (F5): the archived row it copies. Null otherwise.';
comment on column public.vehicle_availability.restored_by_trip_id is
  'For a row restored when a commitment of the unit went away (F5): the trip that was cancelled or assigned '
  'another unit. Null otherwise.';

-- Same as F5, plus the trip that lets go of the unit, recorded on the copy.
drop function public.restore_vehicle_availability(uuid);

create function public.restore_vehicle_availability(p_vehicle_id uuid, p_trip_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.vehicle_availability;
begin
  perform 1 from public.vehicles v where v.id = p_vehicle_id and v.archived_at is null for update;
  if not found then
    return;
  end if;
  if exists (select 1 from public.vehicle_availability a where a.vehicle_id = p_vehicle_id and a.archived_at is null)
     or exists (
       select 1 from public.trips t where t.id = public.vehicle_committing_trip(p_vehicle_id, null)
         and t.status in ('pending_assignment', 'assigned')
     ) then
    return;
  end if;

  select * into v_row from public.vehicle_availability a
  where a.vehicle_id = p_vehicle_id
  order by a.created_at desc, a.id desc
  limit 1;
  if v_row.ended_by_trip_id is null
     or exists (
       select 1 from public.trips t
       left join public.offers o on o.id = t.offer_id
       where t.id = v_row.ended_by_trip_id
         and t.status not in ('delivered', 'closed', 'cancelled')
         and (t.vehicle_id = p_vehicle_id
              or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = p_vehicle_id))
     ) then
    return;
  end if;

  insert into public.vehicle_availability (
    company_id, vehicle_id, available_from, location, city, state, source, created_by,
    restored_from_id, restored_by_trip_id
  ) values (
    v_row.company_id, v_row.vehicle_id, v_row.available_from, v_row.location, v_row.city, v_row.state,
    v_row.source, v_row.created_by, v_row.id, p_trip_id
  );
end;
$$;

revoke all on function public.restore_vehicle_availability(uuid, uuid) from public, anon, authenticated;

-- Same as F5, passing the trip to restore_vehicle_availability.
create or replace function public.trips_restore_vehicle_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_offered uuid;
  v_old uuid := old.vehicle_id;
  v_new uuid := new.vehicle_id;
begin
  select o.vehicle_id into v_offered from public.offers o where o.id = new.offer_id;
  if v_old is null and old.status = 'pending_assignment' then
    v_old := v_offered;
  end if;
  if new.status = 'cancelled' then
    v_new := null;
  elsif v_new is null and new.status = 'pending_assignment' then
    v_new := v_offered;
  end if;
  if v_old is not null and v_old is distinct from v_new then
    perform public.restore_vehicle_availability(v_old, new.id);
  end if;
  -- The unit sets off: nothing written before is where it will be, so what
  -- its commitments held back is no longer restored (even if this trip is
  -- cancelled later). Same unit lock as set_trip_vehicle_availability: an
  -- estimate written meanwhile is waited for and then seen (the update is a
  -- later statement), or it waits and is written after the departure.
  if new.status not in ('pending_assignment', 'assigned', 'cancelled') then
    perform 1 from public.vehicles v where v.id = new.vehicle_id for update;
    update public.vehicle_availability
    set ended_by_trip_id = null
    where vehicle_id = new.vehicle_id and archived_at is not null and ended_by_trip_id is not null;
  end if;
  return null;
end;
$$;
