-- F8 · confirm_delivery takes an idempotency key (p_client_event_id), like
-- record_trip_event and report_incident. A double submit or a retry of the
-- same confirmation (web) succeeds again instead of failing because the trip
-- is already closed; a confirmation with another key still fails.
--
-- The key is stored on the `delivery_confirmed` event (trip_events is unique on
-- (trip_id, client_event_id)) and checked under the trip lock, so two retries
-- never both close the trip.

drop function public.confirm_delivery(uuid, text);

create function public.confirm_delivery(
  p_trip_id uuid,
  p_notes text default null,
  p_client_event_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_notes text := nullif(btrim(p_notes), '');
  v_event_type public.trip_event_type;
begin
  if not public.is_admin() and not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.shipper_company_id = public.auth_shipper_company_id()
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip not found' using errcode = '42501';
  end if;

  -- Under the trip lock: a repeated key returns the confirmation it already made.
  if p_client_event_id is not null then
    select e.event_type into v_event_type from public.trip_events e
    where e.trip_id = v_trip.id and e.client_event_id = p_client_event_id;
    if found then
      if v_event_type <> 'delivery_confirmed' then
        raise exception 'client_event_id belongs to another event' using errcode = '22023';
      end if;
      return;
    end if;
  end if;

  if v_trip.status <> 'delivered' then
    raise exception 'cannot confirm delivery of a trip in status %', v_trip.status using errcode = '55000';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;

  update public.trips set status = 'closed', closed_at = now() where id = v_trip.id;
  update public.loads set status = 'completed' where id = v_trip.load_id and status = 'in_progress';

  insert into public.trip_events (
    trip_id, event_type, from_status, to_status, occurred_at, notes, actor_id, actor_role, client_event_id
  ) values (
    v_trip.id, 'delivery_confirmed', 'delivered', 'closed', now(), v_notes, (select auth.uid()),
    public.auth_role(), p_client_event_id
  );
end;
$$;

revoke all on function public.confirm_delivery(uuid, text, uuid) from public, anon;
grant execute on function public.confirm_delivery(uuid, text, uuid) to authenticated;
