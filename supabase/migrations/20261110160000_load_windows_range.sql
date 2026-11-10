-- I6 · Correction (verification, round 2): load windows within a plausible
-- range.
--
-- create_load, update_load and request_brokered_load (all through
-- apply_load_payload) took any valid `timestamptz`. A window on 9999-12-31
-- after 18:00 in Mexico City is year 10000 in UTC: PostgREST returns it as
-- "10000-01-01T…", which JavaScript cannot read, and the pages that list the
-- load (/admin/intermediadas, /admin/cargas, /cliente/cargas and the
-- carriers' lists once published) failed with a 500 for good. Same class of
-- error as 20261110110000_freight_invoice_issued_at_range. Now:
--
--   * apply_load_payload refuses (22023, "invalid load: dates out of range",
--     which the web shows with its copy) a window that starts before
--     yesterday or ends more than a year from now: a new load, an edit (also
--     of a draft) and a load sent to the platform;
--   * the table checks a range every client can read (from 2022, before
--     2100) on top of the RPC, for any other writer. NOT VALID: rows that
--     already exist are not checked (the apps show a date they cannot read
--     as "fecha no válida" instead of failing), every new or changed row is.
--     The lower bound is fixed, not "yesterday", so a load that is already
--     contracted can still change status after its dates went by.

create or replace function public.apply_load_payload(p_load public.loads, p_payload jsonb)
returns public.loads
language plpgsql
stable
set search_path = ''
as $$
declare
  v_place jsonb;
  v_prefix text;
  v_requirements public.special_requirement[];
  v_price jsonb := p_payload -> 'proposedPriceCents';
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid load: payload must be an object' using errcode = '22023';
  end if;

  begin
    foreach v_prefix in array array['origin', 'destination'] loop
      v_place := p_payload -> v_prefix;
      if jsonb_typeof(v_place) is distinct from 'object'
         or jsonb_typeof(v_place -> 'lat') is distinct from 'number'
         or jsonb_typeof(v_place -> 'lng') is distinct from 'number'
         or nullif(btrim(v_place ->> 'address'), '') is null
         or nullif(btrim(v_place ->> 'city'), '') is null
         or nullif(btrim(v_place ->> 'state'), '') is null then
        raise exception 'invalid load: % is incomplete', v_prefix using errcode = '22023';
      end if;
      if v_prefix = 'origin' then
        p_load.origin_address := btrim(v_place ->> 'address');
        p_load.origin_city := btrim(v_place ->> 'city');
        p_load.origin_state := btrim(v_place ->> 'state');
        p_load.origin_place_id := nullif(btrim(v_place ->> 'placeId'), '');
        p_load.origin_lat := (v_place ->> 'lat')::double precision;
        p_load.origin_lng := (v_place ->> 'lng')::double precision;
      else
        p_load.destination_address := btrim(v_place ->> 'address');
        p_load.destination_city := btrim(v_place ->> 'city');
        p_load.destination_state := btrim(v_place ->> 'state');
        p_load.destination_place_id := nullif(btrim(v_place ->> 'placeId'), '');
        p_load.destination_lat := (v_place ->> 'lat')::double precision;
        p_load.destination_lng := (v_place ->> 'lng')::double precision;
      end if;
    end loop;

    p_load.pickup_window_start := (p_payload #>> '{pickupWindow,start}')::timestamptz;
    p_load.pickup_window_end := (p_payload #>> '{pickupWindow,end}')::timestamptz;
    p_load.delivery_window_start := (p_payload #>> '{deliveryWindow,start}')::timestamptz;
    p_load.delivery_window_end := (p_payload #>> '{deliveryWindow,end}')::timestamptz;
    p_load.cargo_type := (p_payload ->> 'cargoType')::public.cargo_type;
    p_load.description := nullif(btrim(p_payload ->> 'description'), '');
    p_load.weight_kg := (p_payload ->> 'weightKg')::numeric;
    p_load.volume_m3 := (p_payload ->> 'volumeM3')::numeric;
    p_load.unit_type := (p_payload ->> 'unitType')::public.unit_type;
    p_load.notes := nullif(btrim(p_payload ->> 'notes'), '');

    if jsonb_typeof(coalesce(p_payload -> 'specialRequirements', '[]')) <> 'array' then
      raise exception 'invalid load: specialRequirements must be an array' using errcode = '22023';
    end if;
    select coalesce(array_agg(r::public.special_requirement), '{}') into v_requirements
    from jsonb_array_elements_text(coalesce(p_payload -> 'specialRequirements', '[]')) r;
    if cardinality(v_requirements) <> (select count(distinct x) from unnest(v_requirements) x) then
      raise exception 'invalid load: duplicated special requirements' using errcode = '22023';
    end if;
    p_load.special_requirements := v_requirements;

    -- Money is integer cents: reject fractions instead of rounding them.
    if jsonb_typeof(v_price) is distinct from 'number' or (v_price::text)::numeric <> trunc((v_price::text)::numeric) then
      raise exception 'invalid load: proposedPriceCents must be integer cents' using errcode = '22023';
    end if;
    p_load.proposed_price_cents := (v_price::text)::bigint;
  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
         or numeric_value_out_of_range or invalid_parameter_value then
      raise exception 'invalid load: %', sqlerrm using errcode = '22023';
  end;

  if p_load.pickup_window_start is null or p_load.pickup_window_end is null
     or p_load.delivery_window_start is null or p_load.delivery_window_end is null
     or p_load.cargo_type is null or p_load.description is null or p_load.weight_kg is null
     or p_load.unit_type is null then
    raise exception 'invalid load: missing required fields' using errcode = '22023';
  end if;

  -- The four bounds of the windows, from yesterday to a year from now: a
  -- window in year 9999 (Mexico City) is year 10000 in UTC, which no client
  -- can read. loads_windows_range backs it with a fixed range for any writer.
  if least(p_load.pickup_window_start, p_load.pickup_window_end,
           p_load.delivery_window_start, p_load.delivery_window_end) < now() - interval '1 day'
     or greatest(p_load.pickup_window_start, p_load.pickup_window_end,
                 p_load.delivery_window_start, p_load.delivery_window_end) > now() + interval '1 year' then
    raise exception 'invalid load: dates out of range' using errcode = '22023';
  end if;

  return p_load;
end;
$$;

-- create or replace keeps the privileges; stated again so they stay obvious.
revoke all on function public.apply_load_payload(public.loads, jsonb) from public, anon, authenticated;

alter table public.loads
  add constraint loads_windows_range check (
    pickup_window_start >= timestamptz '2022-01-01 00:00:00-06'
    and delivery_window_start >= timestamptz '2022-01-01 00:00:00-06'
    and pickup_window_end < timestamptz '2100-01-01 00:00:00+00'
    and delivery_window_end < timestamptz '2100-01-01 00:00:00+00'
  ) not valid;
