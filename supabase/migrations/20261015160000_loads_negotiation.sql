-- B05 · Loads and negotiation: loads, negotiations (load x carrier) and offers.
--
-- Security model (same as B01-B04):
--   * Every table has RLS; `anon` gets nothing and `authenticated` only SELECT.
--     Every write goes through a `security definer` RPC that validates the
--     actor, the company status and the state transition (plan §0.3).
--   * Shippers (role `shipper` of a shipper company) own their loads. Carriers
--     (role `carrier`, auth_fleet_company_id()) negotiate. Operators do neither.
--   * Only `approved` companies publish loads or take part in a negotiation.
--     A shipper in review may still prepare drafts.
--   * `published`/`negotiating` loads are visible to every approved carrier; a
--     negotiation and its offers only to its two companies (and admins).
--
-- Concurrency: every RPC that changes a load or its offers first locks the
-- load row (FOR UPDATE), then the offer. All of them serialize on the load, in
-- the same lock order, so `accept_offer` cannot race another acceptance, a new
-- offer or a cancellation. The partial unique index offers_one_accepted_per_load
-- is the last line of defense.

-- ---------------------------------------------------------------------------
-- Enums (identifiers match packages/shared enums from B02)
-- ---------------------------------------------------------------------------
create type public.load_status as enum (
  'draft',
  'published',
  'negotiating',
  'contracted',
  'in_progress',
  'completed',
  'cancelled',
  'expired'
);

create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired');

create type public.offer_side as enum ('shipper', 'carrier');

create type public.cargo_type as enum (
  'general',
  'palletized',
  'perishable',
  'dry_bulk',
  'liquid_bulk',
  'hazardous',
  'oversized',
  'containerized',
  'vehicles',
  'construction_materials',
  'livestock'
);

-- ---------------------------------------------------------------------------
-- Helper: the shipper company whose loads the caller manages, or null.
-- ---------------------------------------------------------------------------
create function public.auth_shipper_company_id()
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
    and p.role = 'shipper'
    and c.type = 'shipper'
    and c.archived_at is null;
$$;

revoke all on function public.auth_shipper_company_id() from public, anon;
grant execute on function public.auth_shipper_company_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- loads
-- ---------------------------------------------------------------------------
create table public.loads (
  id uuid primary key default gen_random_uuid(),
  shipper_company_id uuid not null references public.companies (id) on delete restrict,
  status public.load_status not null default 'draft',

  origin_address text not null constraint loads_origin_address_length check (char_length(origin_address) between 1 and 300),
  origin_city text not null constraint loads_origin_city_length check (char_length(origin_city) between 1 and 120),
  origin_state text not null constraint loads_origin_state_length check (char_length(origin_state) between 1 and 120),
  origin_place_id text constraint loads_origin_place_id_length check (char_length(origin_place_id) <= 300),
  origin_lat double precision not null,
  origin_lng double precision not null,
  origin_location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(origin_lng, origin_lat), 4326)::extensions.geography
  ) stored,

  destination_address text not null
    constraint loads_destination_address_length check (char_length(destination_address) between 1 and 300),
  destination_city text not null
    constraint loads_destination_city_length check (char_length(destination_city) between 1 and 120),
  destination_state text not null
    constraint loads_destination_state_length check (char_length(destination_state) between 1 and 120),
  destination_place_id text
    constraint loads_destination_place_id_length check (char_length(destination_place_id) <= 300),
  destination_lat double precision not null,
  destination_lng double precision not null,
  destination_location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(destination_lng, destination_lat), 4326)::extensions.geography
  ) stored,

  pickup_window_start timestamptz not null,
  pickup_window_end timestamptz not null,
  delivery_window_start timestamptz not null,
  delivery_window_end timestamptz not null,

  cargo_type public.cargo_type not null,
  description text not null constraint loads_description_length check (char_length(description) between 1 and 500),
  weight_kg numeric(8, 2) not null constraint loads_weight_kg_range check (weight_kg > 0 and weight_kg <= 80000),
  volume_m3 numeric(6, 2) constraint loads_volume_m3_range check (volume_m3 > 0 and volume_m3 <= 200),
  unit_type public.unit_type not null,
  special_requirements public.special_requirement[] not null default '{}',
  proposed_price_cents bigint not null
    constraint loads_proposed_price_range check (proposed_price_cents > 0 and proposed_price_cents <= 10000000000),
  notes text constraint loads_notes_length check (char_length(notes) <= 1000),

  -- Set by accept_offer.
  accepted_offer_id uuid,
  carrier_company_id uuid references public.companies (id) on delete restrict,
  agreed_price_cents bigint constraint loads_agreed_price_positive check (agreed_price_cents > 0),
  contracted_at timestamptz,

  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text constraint loads_cancellation_reason_length check (char_length(cancellation_reason) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint loads_id_shipper_key unique (id, shipper_company_id),
  -- Mirrors placeSchema / loadFormSchema (packages/shared).
  constraint loads_inside_mexico check (
    origin_lat between 14.3 and 32.8 and origin_lng between -118.6 and -86.5
    and destination_lat between 14.3 and 32.8 and destination_lng between -118.6 and -86.5
  ),
  constraint loads_distinct_places check (
    abs(origin_lat - destination_lat) >= 0.01 or abs(origin_lng - destination_lng) >= 0.01
  ),
  constraint loads_windows_order check (
    pickup_window_end > pickup_window_start
    and delivery_window_end > delivery_window_start
    and delivery_window_end > pickup_window_start
  ),
  constraint loads_contract_consistent check (
    (status in ('contracted', 'in_progress', 'completed'))
      = (accepted_offer_id is not null and carrier_company_id is not null and agreed_price_cents is not null)
    or (status = 'cancelled' and accepted_offer_id is not null)
  )
);

comment on table public.loads is
  'Freight needs published by shippers. Written only through the load and negotiation RPCs.';

create index loads_shipper_company_idx on public.loads (shipper_company_id, created_at desc);
create index loads_carrier_company_idx on public.loads (carrier_company_id) where carrier_company_id is not null;
create index loads_open_idx on public.loads (pickup_window_start)
  where status in ('published', 'negotiating') and archived_at is null;
create index loads_open_origin_idx on public.loads using gist (origin_location)
  where status in ('published', 'negotiating') and archived_at is null;
create index loads_open_destination_idx on public.loads using gist (destination_location)
  where status in ('published', 'negotiating') and archived_at is null;

create trigger loads_set_updated_at
before update on public.loads
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- negotiations: one per load and carrier company.
-- ---------------------------------------------------------------------------
create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null,
  shipper_company_id uuid not null,
  carrier_company_id uuid not null references public.companies (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint negotiations_load_fkey foreign key (load_id, shipper_company_id)
    references public.loads (id, shipper_company_id) on delete restrict,
  constraint negotiations_load_carrier_key unique (load_id, carrier_company_id),
  constraint negotiations_parties_key unique (id, load_id, shipper_company_id, carrier_company_id)
);

comment on table public.negotiations is
  'Negotiation between a load''s shipper and one carrier company. Created by make_offer.';

create index negotiations_carrier_company_idx on public.negotiations (carrier_company_id, updated_at desc);
create index negotiations_shipper_company_idx on public.negotiations (shipper_company_id, updated_at desc);

create trigger negotiations_set_updated_at
before update on public.negotiations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- offers: chain of offers and counteroffers inside a negotiation.
-- ---------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null,
  load_id uuid not null,
  shipper_company_id uuid not null,
  carrier_company_id uuid not null,
  side public.offer_side not null,
  amount_cents bigint not null
    constraint offers_amount_range check (amount_cents > 0 and amount_cents <= 10000000000),
  conditions text constraint offers_conditions_length check (char_length(conditions) <= 1000),
  -- Unit the carrier proposes; always one of its own (composite FK).
  vehicle_id uuid,
  status public.offer_status not null default 'pending',
  status_reason text constraint offers_status_reason_length check (char_length(status_reason) <= 1000),
  -- The offer this one counters.
  parent_offer_id uuid references public.offers (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  constraint offers_negotiation_fkey foreign key (negotiation_id, load_id, shipper_company_id, carrier_company_id)
    references public.negotiations (id, load_id, shipper_company_id, carrier_company_id) on delete restrict,
  constraint offers_vehicle_fkey foreign key (carrier_company_id, vehicle_id)
    references public.vehicles (company_id, id) on delete restrict,
  constraint offers_vehicle_only_carrier check (side = 'carrier' or vehicle_id is null),
  constraint offers_response_consistent check ((status = 'pending') = (responded_at is null))
);

comment on table public.offers is 'Offers and counteroffers. Status changes only through the negotiation RPCs.';

-- At most one open offer per negotiation, and one accepted offer per load.
create unique index offers_one_pending_per_negotiation on public.offers (negotiation_id) where status = 'pending';
create unique index offers_one_accepted_per_load on public.offers (load_id) where status = 'accepted';
create index offers_negotiation_idx on public.offers (negotiation_id, created_at);
create index offers_load_pending_idx on public.offers (load_id) where status = 'pending';
create index offers_parent_idx on public.offers (parent_offer_id) where parent_offer_id is not null;

alter table public.loads
  add constraint loads_accepted_offer_fkey foreign key (accepted_offer_id)
  references public.offers (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Audit: admin writes on loads are recorded (B03 audit_log). The B03 function
-- learns that a load belongs to its shipper company; behavior is otherwise
-- unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.audit_admin_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if not public.is_admin() then
    return null;
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, company_id, old_data, new_data)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case tg_table_name
      when 'companies' then (v_row ->> 'id')::uuid
      when 'loads' then (v_row ->> 'shipper_company_id')::uuid
      else (v_row ->> 'company_id')::uuid
    end,
    v_old,
    v_new
  );
  return null;
end;
$$;

revoke all on function public.audit_admin_action() from public, anon, authenticated;

create trigger loads_audit_admin
after insert or update or delete on public.loads
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- Internal: share-lock a company row and tell whether it is approved. RPCs
-- call it after taking the load lock, right before writing: a suspension that
-- committed while the RPC waited is seen (the row is re-read), and one that
-- starts later waits until the RPC commits. Share locks do not conflict with
-- each other, so concurrent RPCs never block on it.
-- ---------------------------------------------------------------------------
create function public.lock_company_approved(p_company_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.companies c
  where c.id = p_company_id and c.status = 'approved' and c.archived_at is null
  for share;
  return found;
end;
$$;

revoke all on function public.lock_company_approved(uuid) from public, anon, authenticated;

-- Internal: fail unless the pickup window of a load is still open. Used by the
-- RPCs that move a negotiation forward (counter, accept) while holding the
-- load lock; rejecting and withdrawing stay possible after the deadline.
create function public.assert_pickup_open(p_load_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select l.pickup_window_end <= now() from public.loads l where l.id = p_load_id) then
    raise exception 'pickup window already ended' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.assert_pickup_open(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal: validate a load payload and write its fields into `p_load`.
-- The payload is the output of loadFormSchema (packages/shared), as JSON:
--   { origin: {address, city, state, lat, lng, placeId?}, destination: {...},
--     pickupWindow: {start, end}, deliveryWindow: {start, end}, cargoType,
--     description, weightKg, volumeM3?, unitType, specialRequirements[],
--     proposedPriceCents, notes? }
-- Table constraints re-check the invariants; this gives one clear error.
-- ---------------------------------------------------------------------------
create function public.apply_load_payload(p_load public.loads, p_payload jsonb)
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

  return p_load;
end;
$$;

revoke all on function public.apply_load_payload(public.loads, jsonb) from public, anon, authenticated;

-- Internal: keep `published` <-> `negotiating` in sync with the open offers of
-- a load. The caller must hold the load's row lock.
create function public.sync_load_negotiation_status(p_load_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_has_pending boolean := exists (
    select 1 from public.offers o where o.load_id = p_load_id and o.status = 'pending'
  );
begin
  update public.loads
  set status = case when v_has_pending then 'negotiating' else 'published' end::public.load_status
  where id = p_load_id
    and status in ('published', 'negotiating')
    and status <> case when v_has_pending then 'negotiating' else 'published' end::public.load_status;
end;
$$;

revoke all on function public.sync_load_negotiation_status(uuid) from public, anon, authenticated;

-- Internal hook for B06: creates the trip of an accepted offer and returns its
-- id. Until B06 lands there is no trips table, so it returns null; B06
-- replaces this function (same signature) and accept_offer picks it up.
create function public.create_trip_for_accepted_offer(p_offer_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  return null;
end;
$$;

revoke all on function public.create_trip_for_accepted_offer(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create a draft load for the caller's shipper company. Drafts may be
-- prepared while the company is in review; publishing needs approval.
-- ---------------------------------------------------------------------------
create function public.create_load(p_load jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.auth_shipper_company_id();
  v_load public.loads;
  v_constraint text;
begin
  if v_company_id is null then
    raise exception 'only shippers can create loads' using errcode = '42501';
  end if;

  v_load := public.apply_load_payload(v_load, p_load);
  v_load.id := gen_random_uuid();
  v_load.shipper_company_id := v_company_id;
  v_load.status := 'draft';
  v_load.special_requirements := coalesce(v_load.special_requirements, '{}');
  v_load.created_by := (select auth.uid());

  begin
    insert into public.loads (
      id, shipper_company_id, status,
      origin_address, origin_city, origin_state, origin_place_id, origin_lat, origin_lng,
      destination_address, destination_city, destination_state, destination_place_id, destination_lat, destination_lng,
      pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
      cargo_type, description, weight_kg, volume_m3, unit_type, special_requirements, proposed_price_cents, notes,
      created_by
    ) values (
      v_load.id, v_load.shipper_company_id, v_load.status,
      v_load.origin_address, v_load.origin_city, v_load.origin_state, v_load.origin_place_id,
      v_load.origin_lat, v_load.origin_lng,
      v_load.destination_address, v_load.destination_city, v_load.destination_state, v_load.destination_place_id,
      v_load.destination_lat, v_load.destination_lng,
      v_load.pickup_window_start, v_load.pickup_window_end, v_load.delivery_window_start, v_load.delivery_window_end,
      v_load.cargo_type, v_load.description, v_load.weight_kg, v_load.volume_m3, v_load.unit_type,
      v_load.special_requirements, v_load.proposed_price_cents, v_load.notes,
      v_load.created_by
    );
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'invalid load: % violated', v_constraint using errcode = '22023';
  end;

  return v_load.id;
end;
$$;

revoke all on function public.create_load(jsonb) from public, anon;
grant execute on function public.create_load(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: replace the editable fields of a load. Drafts are always editable by
-- their shipper; published or negotiating loads only while the company is
-- approved (producto §3: editable until contracted). Ongoing offers stay.
-- ---------------------------------------------------------------------------
create function public.update_load(p_load_id uuid, p_load jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_load public.loads;
  v_constraint text;
begin
  -- Filtering by owner in the WHERE clause means other companies' loads are
  -- never locked by this call.
  select * into v_load from public.loads
  where id = p_load_id and shipper_company_id = public.auth_shipper_company_id()
  for update;
  if not found then
    raise exception 'load not found' using errcode = '42501';
  end if;
  if v_load.status not in ('draft', 'published', 'negotiating') then
    raise exception 'cannot edit a load in status %', v_load.status using errcode = '55000';
  end if;
  if v_load.status <> 'draft' and not public.lock_company_approved(v_load.shipper_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  v_load := public.apply_load_payload(v_load, p_load);
  if v_load.status <> 'draft' and v_load.pickup_window_end <= now() then
    raise exception 'invalid load: pickup window already ended' using errcode = '22023';
  end if;

  begin
    update public.loads
    set origin_address = v_load.origin_address,
        origin_city = v_load.origin_city,
        origin_state = v_load.origin_state,
        origin_place_id = v_load.origin_place_id,
        origin_lat = v_load.origin_lat,
        origin_lng = v_load.origin_lng,
        destination_address = v_load.destination_address,
        destination_city = v_load.destination_city,
        destination_state = v_load.destination_state,
        destination_place_id = v_load.destination_place_id,
        destination_lat = v_load.destination_lat,
        destination_lng = v_load.destination_lng,
        pickup_window_start = v_load.pickup_window_start,
        pickup_window_end = v_load.pickup_window_end,
        delivery_window_start = v_load.delivery_window_start,
        delivery_window_end = v_load.delivery_window_end,
        cargo_type = v_load.cargo_type,
        description = v_load.description,
        weight_kg = v_load.weight_kg,
        volume_m3 = v_load.volume_m3,
        unit_type = v_load.unit_type,
        special_requirements = v_load.special_requirements,
        proposed_price_cents = v_load.proposed_price_cents,
        notes = v_load.notes
    where id = v_load.id;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'invalid load: % violated', v_constraint using errcode = '22023';
  end;
end;
$$;

revoke all on function public.update_load(uuid, jsonb) from public, anon;
grant execute on function public.update_load(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: publish a draft (draft -> published). Approved shippers only, and the
-- pickup window must still be ahead.
-- ---------------------------------------------------------------------------
create function public.publish_load(p_load_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_load public.loads;
begin
  -- Filtering by owner in the WHERE clause means other companies' loads are
  -- never locked by this call.
  select * into v_load from public.loads
  where id = p_load_id and shipper_company_id = public.auth_shipper_company_id()
  for update;
  if not found then
    raise exception 'load not found' using errcode = '42501';
  end if;
  if not public.lock_company_approved(v_load.shipper_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;
  if v_load.status <> 'draft' then
    raise exception 'cannot publish a load in status %', v_load.status using errcode = '55000';
  end if;
  if v_load.pickup_window_end <= now() then
    raise exception 'pickup window already ended' using errcode = '22023';
  end if;

  update public.loads set status = 'published', published_at = now() where id = v_load.id;
end;
$$;

revoke all on function public.publish_load(uuid) from public, anon;
grant execute on function public.publish_load(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cancel a load before it is contracted (draft | published | negotiating
-- -> cancelled), by its shipper or an admin. Pending offers are closed as
-- rejected. Contracted loads are cancelled through their trip (B06).
-- ---------------------------------------------------------------------------
create function public.cancel_load(p_load_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_load public.loads;
  v_reason text := nullif(btrim(p_reason), '');
begin
  select * into v_load from public.loads
  where id = p_load_id and (shipper_company_id = public.auth_shipper_company_id() or public.is_admin())
  for update;
  if not found then
    raise exception 'load not found' using errcode = '42501';
  end if;
  if v_load.status not in ('draft', 'published', 'negotiating') then
    raise exception 'cannot cancel a load in status %', v_load.status using errcode = '55000';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'reason is too long' using errcode = '22023';
  end if;

  update public.offers
  set status = 'rejected', status_reason = 'load_cancelled', responded_by = (select auth.uid()), responded_at = now()
  where load_id = v_load.id and status = 'pending';

  update public.loads
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = v_reason
  where id = v_load.id;
end;
$$;

revoke all on function public.cancel_load(uuid, text) from public, anon;
grant execute on function public.cancel_load(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal: validate the offer fields shared by make_offer and counter_offer.
-- ---------------------------------------------------------------------------
create function public.check_offer_fields(
  p_carrier_company_id uuid,
  p_side public.offer_side,
  p_amount_cents bigint,
  p_conditions text,
  p_vehicle_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000000 then
    raise exception 'invalid offer: amount out of range' using errcode = '22023';
  end if;
  if char_length(p_conditions) > 1000 then
    raise exception 'invalid offer: conditions are too long' using errcode = '22023';
  end if;
  if p_vehicle_id is not null then
    if p_side <> 'carrier' then
      raise exception 'invalid offer: only carriers propose a unit' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.vehicles v
      where v.id = p_vehicle_id and v.company_id = p_carrier_company_id and v.archived_at is null
    ) then
      raise exception 'invalid offer: vehicle not found' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function public.check_offer_fields(uuid, public.offer_side, bigint, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: a carrier makes an offer on an open load. Opens (or reuses) the
-- negotiation of its company on that load; the load moves to `negotiating`.
-- Returns the new offer id.
-- ---------------------------------------------------------------------------
create function public.make_offer(
  p_load_id uuid,
  p_amount_cents bigint,
  p_conditions text default null,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_carrier_id uuid := public.auth_fleet_company_id();
  v_load public.loads;
  v_negotiation_id uuid;
  v_offer_id uuid;
  v_conditions text := nullif(btrim(p_conditions), '');
begin
  if v_carrier_id is null then
    raise exception 'only carriers can make offers' using errcode = '42501';
  end if;
  if not public.is_company_approved() then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  -- Authorize before locking: a carrier may only touch loads that are open or
  -- that it already negotiated, so it can never lock other shippers' drafts.
  -- The status is only revealed to carriers that negotiated the load.
  if not exists (
    select 1 from public.loads l
    where l.id = p_load_id
      and l.archived_at is null
      and (
        l.status in ('published', 'negotiating')
        or exists (
          select 1 from public.negotiations n where n.load_id = l.id and n.carrier_company_id = v_carrier_id
        )
      )
  ) then
    raise exception 'load not found' using errcode = '42501';
  end if;

  -- Lock order: load, then offers (shared by every RPC of this file). The
  -- status is re-read under the lock (it may have changed while waiting).
  select * into v_load from public.loads where id = p_load_id for update;
  if v_load.status not in ('published', 'negotiating') then
    if not exists (
      select 1 from public.negotiations n where n.load_id = v_load.id and n.carrier_company_id = v_carrier_id
    ) then
      raise exception 'load not found' using errcode = '42501';
    end if;
    raise exception 'cannot offer on a load in status %', v_load.status using errcode = '55000';
  end if;
  if v_load.pickup_window_end <= now() then
    raise exception 'pickup window already ended' using errcode = '55000';
  end if;
  -- Re-checked under the load lock: the carrier may have been suspended while
  -- this call waited for it.
  if not public.lock_company_approved(v_carrier_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  perform public.check_offer_fields(v_carrier_id, 'carrier', p_amount_cents, v_conditions, p_vehicle_id);

  insert into public.negotiations (load_id, shipper_company_id, carrier_company_id, created_by)
  values (v_load.id, v_load.shipper_company_id, v_carrier_id, v_uid)
  on conflict (load_id, carrier_company_id) do update set updated_at = now()
  returning id into v_negotiation_id;

  if exists (select 1 from public.offers where negotiation_id = v_negotiation_id and status = 'pending') then
    raise exception 'negotiation already has a pending offer' using errcode = '55000';
  end if;

  insert into public.offers (
    negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents, conditions, vehicle_id, created_by
  ) values (
    v_negotiation_id, v_load.id, v_load.shipper_company_id, v_carrier_id, 'carrier', p_amount_cents, v_conditions,
    p_vehicle_id, v_uid
  )
  returning id into v_offer_id;

  perform public.sync_load_negotiation_status(v_load.id);
  return v_offer_id;
end;
$$;

revoke all on function public.make_offer(uuid, bigint, text, uuid) from public, anon;
grant execute on function public.make_offer(uuid, bigint, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal: lock and return a pending offer for a response by the caller.
-- Locks the load first (shared lock order), then the offer, and checks that
-- the caller belongs to the expected side (`p_by` = 'counterparty' for accept,
-- reject and counter; 'author' for withdraw) and that its company is approved.
-- Returns the offer; the caller's side is the counterparty's or the author's.
-- ---------------------------------------------------------------------------
create function public.lock_offer_for_response(p_offer_id uuid, p_by text)
returns public.offers
language plpgsql
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_caller_side public.offer_side;
  v_load_status public.load_status;
begin
  -- The parties and the load of an offer never change, so the caller is
  -- authorized before any lock is taken: strangers cannot lock other loads.
  select * into v_offer from public.offers where id = p_offer_id;
  if found and v_offer.shipper_company_id = public.auth_shipper_company_id() then
    v_caller_side := 'shipper';
  elsif found and v_offer.carrier_company_id = public.auth_fleet_company_id() then
    v_caller_side := 'carrier';
  else
    raise exception 'offer not found' using errcode = '42501';
  end if;

  select l.status into v_load_status from public.loads l where l.id = v_offer.load_id for update;
  select * into v_offer from public.offers where id = p_offer_id for update;

  if (p_by = 'author') <> (v_caller_side = v_offer.side) then
    raise exception 'offer cannot be answered by this side' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'offer is no longer pending (status %)', v_offer.status using errcode = '55000';
  end if;
  if v_load_status not in ('published', 'negotiating') then
    raise exception 'load is no longer open (status %)', v_load_status using errcode = '55000';
  end if;
  if p_by = 'counterparty' and not public.lock_company_approved(
    case v_caller_side when 'shipper' then v_offer.shipper_company_id else v_offer.carrier_company_id end
  ) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  return v_offer;
end;
$$;

revoke all on function public.lock_offer_for_response(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the counterparty answers a pending offer with a new amount. The offer
-- becomes `countered` and a new pending offer from the caller's side is
-- created in the same negotiation. Returns the new offer id.
-- ---------------------------------------------------------------------------
create function public.counter_offer(
  p_offer_id uuid,
  p_amount_cents bigint,
  p_conditions text default null,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_offer public.offers := public.lock_offer_for_response(p_offer_id, 'counterparty');
  v_side public.offer_side := case v_offer.side when 'carrier' then 'shipper' else 'carrier' end::public.offer_side;
  v_conditions text := nullif(btrim(p_conditions), '');
  v_new_id uuid;
begin
  perform public.assert_pickup_open(v_offer.load_id);
  perform public.check_offer_fields(v_offer.carrier_company_id, v_side, p_amount_cents, v_conditions, p_vehicle_id);

  update public.offers
  set status = 'countered', responded_by = v_uid, responded_at = now()
  where id = v_offer.id;

  insert into public.offers (
    negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents, conditions, vehicle_id,
    parent_offer_id, created_by
  ) values (
    v_offer.negotiation_id, v_offer.load_id, v_offer.shipper_company_id, v_offer.carrier_company_id, v_side,
    p_amount_cents, v_conditions, p_vehicle_id, v_offer.id, v_uid
  )
  returning id into v_new_id;

  update public.negotiations set updated_at = now() where id = v_offer.negotiation_id;
  return v_new_id;
end;
$$;

revoke all on function public.counter_offer(uuid, bigint, text, uuid) from public, anon;
grant execute on function public.counter_offer(uuid, bigint, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the counterparty rejects a pending offer. The negotiation stays (the
-- carrier may offer again); the load goes back to `published` when no offer
-- is left pending.
-- ---------------------------------------------------------------------------
create function public.reject_offer(p_offer_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := public.lock_offer_for_response(p_offer_id, 'counterparty');
  v_reason text := nullif(btrim(p_reason), '');
begin
  if char_length(v_reason) > 1000 then
    raise exception 'reason is too long' using errcode = '22023';
  end if;

  update public.offers
  set status = 'rejected', status_reason = v_reason, responded_by = (select auth.uid()), responded_at = now()
  where id = v_offer.id;

  update public.negotiations set updated_at = now() where id = v_offer.negotiation_id;
  perform public.sync_load_negotiation_status(v_offer.load_id);
end;
$$;

revoke all on function public.reject_offer(uuid, text) from public, anon;
grant execute on function public.reject_offer(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the author withdraws its own pending offer. Allowed even if the
-- company was suspended meanwhile (it only closes the offer).
-- ---------------------------------------------------------------------------
create function public.withdraw_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := public.lock_offer_for_response(p_offer_id, 'author');
begin
  update public.offers
  set status = 'withdrawn', responded_by = (select auth.uid()), responded_at = now()
  where id = v_offer.id;

  update public.negotiations set updated_at = now() where id = v_offer.negotiation_id;
  perform public.sync_load_negotiation_status(v_offer.load_id);
end;
$$;

revoke all on function public.withdraw_offer(uuid) from public, anon;
grant execute on function public.withdraw_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the counterparty accepts a pending offer. Atomically:
--   1. the offer becomes `accepted`;
--   2. every other pending offer of the load becomes `rejected`;
--   3. the load becomes `contracted` with the carrier and the agreed price;
--   4. the trip is created (create_trip_for_accepted_offer, completed in B06).
-- Both companies must be approved at this moment. Concurrent calls on the same
-- load serialize on its row lock; the loser sees the load contracted (or the
-- offer closed) and fails with 55000. Returns the trip id (null until B06).
-- ---------------------------------------------------------------------------
create function public.accept_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_offer public.offers := public.lock_offer_for_response(p_offer_id, 'counterparty');
begin
  perform public.assert_pickup_open(v_offer.load_id);
  -- Share-locks both companies (always shipper, then carrier) so neither can be
  -- suspended between this check and the commit.
  if not public.lock_company_approved(v_offer.shipper_company_id)
     or not public.lock_company_approved(v_offer.carrier_company_id) then
    raise exception 'both companies must be approved to contract' using errcode = '55000';
  end if;

  update public.offers
  set status = 'accepted', responded_by = v_uid, responded_at = now()
  where id = v_offer.id;

  update public.offers
  set status = 'rejected', status_reason = 'other_offer_accepted', responded_by = v_uid, responded_at = now()
  where load_id = v_offer.load_id and status = 'pending' and id <> v_offer.id;

  update public.loads
  set status = 'contracted',
      accepted_offer_id = v_offer.id,
      carrier_company_id = v_offer.carrier_company_id,
      agreed_price_cents = v_offer.amount_cents,
      contracted_at = now()
  where id = v_offer.load_id;

  update public.negotiations set updated_at = now() where id = v_offer.negotiation_id;

  return public.create_trip_for_accepted_offer(v_offer.id);
end;
$$;

revoke all on function public.accept_offer(uuid) from public, anon;
grant execute on function public.accept_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: read-only for clients; every write goes through the RPCs above.
-- ---------------------------------------------------------------------------
revoke all on table public.loads from anon, authenticated;
revoke all on table public.negotiations from anon, authenticated;
revoke all on table public.offers from anon, authenticated;

grant select on table public.loads to authenticated;
grant select on table public.negotiations to authenticated;
grant select on table public.offers to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security. Only select policies: no client writes at all.
-- ---------------------------------------------------------------------------
alter table public.loads enable row level security;
alter table public.negotiations enable row level security;
alter table public.offers enable row level security;

-- loads: the owner shipper; approved carriers while the load is open; the
-- carriers that negotiated it until another carrier wins it (losing carriers
-- do not see the winner nor the agreed price); admins. The negotiations
-- subquery is filtered by the negotiations policy, which never reads loads (no
-- recursion).
create policy loads_select
on public.loads
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or (select public.is_admin())
  or (
    (select public.auth_fleet_company_id()) is not null
    and (
      (
        status in ('published', 'negotiating')
        and archived_at is null
        and (select public.is_company_approved())
      )
      or (
        (carrier_company_id is null or carrier_company_id = (select public.auth_fleet_company_id()))
        and exists (
          select 1 from public.negotiations n
          where n.load_id = loads.id and n.carrier_company_id = (select public.auth_fleet_company_id())
        )
      )
    )
  )
);

-- negotiations and offers: only their two companies, and admins.
create policy negotiations_select
on public.negotiations
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or (select public.is_admin())
);

create policy offers_select
on public.offers
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or (select public.is_admin())
);
