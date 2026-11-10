-- I6 · Brokered loads (D39; plan-v1.md §I, I6).
--
-- Besides publishing a load for the carriers to offer on, a client can send it
-- to the platform: Transport (Fulmis) sets the client's price and a lower rate
-- for the carriers, publishes it once the client approves its price, and
-- negotiates with the carriers in its own name. The carrier only ever sees its
-- rate; the client only ever sees its price; the margin (the difference) is
-- the admins' only (I.0.3).
--
--   * loads.brokered (immutable): the load was sent to the platform. Carriers
--     read it for the "Publicada por Transport" badge.
--   * The carrier's rate is loads.proposed_price_cents (the price every carrier
--     path already reads: lists, detail, recommendations, negotiation) and the
--     agreed carrier price is loads.agreed_price_cents, as for any load. Until
--     Transport quotes it, a brokered load has no rate (0).
--   * The client's side lives in load_client_prices (target price or "Por
--     cotizar", the client's price, the quote status): only the client and the
--     admins read it, it is not in Realtime and no carrier RPC reads it.
--   * The client never reads the carrier's rate: the row of a brokered load,
--     its negotiations and its offers are hidden from shippers (restrictive
--     policies), and the client's screens read client_loads(), the caller's
--     loads with the client's price in place of the carrier's.
--   * Negotiation: a carrier offers on the rate; an admin answers in the name
--     of Transport (the shipper side of the offers): the client cannot answer
--     an offer of a brokered load, nor read it. Transport never agrees above
--     the client's price. The negotiation chat of a brokered load is closed
--     (no participants); after the contract, the trip works as any other.
--   * Freight ledger (I3): the client's amount is its price, the commission is
--     0 and the carrier's net is the agreed carrier price; the margin is the
--     rest (freight_ledgers.margin_cents), for the admins only.
--   * Every change goes through these RPCs: request_brokered_load (client),
--     admin_quote_brokered_load (admin), approve_brokered_quote (client) and
--     the negotiation RPCs; update_load and publish_load refuse brokered loads.
--
-- Lock order: the load row first (as every load and negotiation RPC), then its
-- load_client_prices row, then offers and companies (B05/B16).

-- ---------------------------------------------------------------------------
-- loads.brokered
-- ---------------------------------------------------------------------------
alter table public.loads
  add column brokered boolean not null default false,
  add constraint loads_id_brokered_key unique (id, brokered);

comment on column public.loads.brokered is
  'Sent by the client to the platform (D39): Transport sets the client''s price (load_client_prices) and publishes it at proposed_price_cents, the carriers'' rate. Never changes.';

-- A brokered load has no rate until Transport quotes it (0, never published).
alter table public.loads drop constraint loads_proposed_price_range;
alter table public.loads add constraint loads_proposed_price_range check (
  proposed_price_cents <= 10000000000
  and (proposed_price_cents > 0 or (brokered and proposed_price_cents = 0 and published_at is null))
);

-- ---------------------------------------------------------------------------
-- load_client_prices: the client's side of a brokered load
-- ---------------------------------------------------------------------------
create type public.brokered_quote_status as enum ('requested', 'quoted', 'approved');

comment on type public.brokered_quote_status is
  'Quote of a brokered load: sent to Transport, priced (waiting for the client) or approved. Mirrors BROKERED_QUOTE_STATUSES in @transport/shared.';

create table public.load_client_prices (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null,
  shipper_company_id uuid not null,
  brokered boolean not null default true constraint load_client_prices_brokered_only check (brokered),
  status public.brokered_quote_status not null default 'requested',
  -- What the client would pay; null: "Por cotizar".
  target_price_cents bigint constraint load_client_prices_target_range
    check (target_price_cents > 0 and target_price_cents <= 10000000000),
  -- What Transport charges the client (set by an admin).
  client_price_cents bigint constraint load_client_prices_client_range
    check (client_price_cents > 0 and client_price_cents <= 10000000000),
  quoted_at timestamptz,
  quoted_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint load_client_prices_load_key unique (load_id),
  constraint load_client_prices_load_fkey foreign key (load_id, shipper_company_id)
    references public.loads (id, shipper_company_id) on delete cascade,
  constraint load_client_prices_brokered_fkey foreign key (load_id, brokered)
    references public.loads (id, brokered) on delete cascade,
  constraint load_client_prices_quoted check ((status = 'requested') = (client_price_cents is null)),
  constraint load_client_prices_approved check ((status = 'approved') = (approved_at is not null))
);

comment on table public.load_client_prices is
  'The client''s price of a brokered load (I6, D39). Read by its shipper and the admins only; written only by the I6 RPCs. Never read by a carrier path.';

create trigger load_client_prices_set_updated_at
before update on public.load_client_prices
for each row execute function public.set_updated_at();

create trigger load_client_prices_audit_admin
after insert or update or delete on public.load_client_prices
for each row execute function public.audit_admin_action();

revoke all on table public.load_client_prices from anon, authenticated;
grant select on table public.load_client_prices to authenticated;
alter table public.load_client_prices enable row level security;

create policy load_client_prices_select
on public.load_client_prices
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or (select public.is_admin())
);

-- Whether a load was sent to the platform (loads.brokered never changes).
create function public.load_is_brokered(p_load_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select l.brokered from public.loads l where l.id = p_load_id), false);
$$;

revoke all on function public.load_is_brokered(uuid) from public, anon;
grant execute on function public.load_is_brokered(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The client never reads the carrier's side of a brokered load
-- ---------------------------------------------------------------------------

-- The row of a brokered load carries the carriers' rate and the agreed carrier
-- price: shippers read their brokered loads through client_loads only.
create policy loads_select_brokered_not_shipper
on public.loads
as restrictive
for select
to authenticated
using (not brokered or (select public.auth_shipper_company_id()) is null);

-- Its negotiations and offers are between the carriers and Transport.
create policy negotiations_select_brokered_not_shipper
on public.negotiations
as restrictive
for select
to authenticated
using ((select public.auth_shipper_company_id()) is null or not public.load_is_brokered(load_id));

create policy offers_select_brokered_not_shipper
on public.offers
as restrictive
for select
to authenticated
using ((select public.auth_shipper_company_id()) is null or not public.load_is_brokered(load_id));

-- Its negotiation chat is closed: Transport negotiates with offers only, and
-- the client must not read the carriers (admins still read every chat).
create policy conversations_select_brokered_negotiation
on public.conversations
as restrictive
for select
to authenticated
using (kind <> 'negotiation' or not public.load_is_brokered(load_id) or (select public.is_admin()));

-- Same as F6 (20261022000000_account_erasure_messages.sql), except that the
-- client of a brokered load gets no negotiation (they are Transport's).
create or replace function public.load_negotiation_carriers(p_load_id uuid)
returns table (
  negotiation_id uuid,
  conversation_id uuid,
  carrier_company_id uuid,
  carrier_legal_name text,
  carrier_status public.verification_status,
  unread_messages bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, cv.id, c.id, c.legal_name, c.status,
         (
           select count(*)
           from public.messages m
           where m.conversation_id = cv.id
             and m.sender_id is distinct from (select auth.uid())
             and m.created_at > coalesce(
               (select r.last_read_at from public.message_reads r
                where r.conversation_id = cv.id and r.user_id = (select auth.uid())),
               '-infinity'::timestamptz
             )
         )
  from public.negotiations n
  join public.companies c on c.id = n.carrier_company_id
  left join public.conversations cv on cv.negotiation_id = n.id
  where n.load_id = p_load_id
    and (
      (n.shipper_company_id = (select public.auth_shipper_company_id()) and not public.load_is_brokered(n.load_id))
      or (select public.is_admin())
    )
  order by n.created_at, n.id;
$$;

revoke all on function public.load_negotiation_carriers(uuid) from public, anon;
grant execute on function public.load_negotiation_carriers(uuid) to authenticated;

-- Same as B14 (20261016100000_client_offers.sql), except that the client of a
-- brokered load gets none of the units the carriers proposed to Transport.
create or replace function public.load_offer_vehicles(p_load_id uuid)
returns table (
  vehicle_id uuid,
  kind public.vehicle_kind,
  unit_type public.unit_type,
  capacity_kg integer,
  capacity_m3 numeric,
  features public.special_requirement[],
  model_year integer,
  documents_complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.kind, v.unit_type, v.capacity_kg, v.capacity_m3, v.features, v.model_year,
         not exists (select 1 from public.vehicle_missing_requirements(v.id))
  from public.vehicles v
  where v.id in (
    select o.vehicle_id
    from public.offers o
    where o.load_id = p_load_id
      and o.vehicle_id is not null
      and (
        (o.shipper_company_id = (select public.auth_shipper_company_id()) and not public.load_is_brokered(o.load_id))
        or (select public.is_admin())
      )
  )
  order by v.id;
$$;

revoke all on function public.load_offer_vehicles(uuid) from public, anon;
grant execute on function public.load_offer_vehicles(uuid) to authenticated;

-- Same as H1 (20261102020100_trip_internal_chat.sql), except the negotiation
-- of a brokered load has no participants.
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.trips t on t.id = c.trip_id
    where c.id = p_conversation_id
      and (c.kind <> 'negotiation' or not public.load_is_brokered(c.load_id))
      and (
        (c.kind <> 'trip_internal' and c.shipper_company_id = public.auth_shipper_company_id())
        or c.carrier_company_id = public.auth_fleet_company_id()
        or (
          c.carrier_company_id = public.auth_carrier_company_id()
          and public.conversation_business_unit_id(c.id) = any (public.auth_business_unit_ids())
        )
        or (
          c.kind = 'trip_internal'
          and t.operator_id is not null
          and t.operator_id = public.auth_operator_id()
        )
      )
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated, service_role;

-- The client's loads, as the client sees them (its screens read them here):
-- every column of its loads, except that a brokered load shows the client's
-- price (or nothing until it is quoted) instead of the carriers' rate, and
-- the client's price as the agreed one once contracted. Only ever the
-- caller's company's loads (the loads policies hide the brokered rows from
-- shippers, so this reads them as the owner).
create function public.client_loads()
returns table (
  id uuid,
  shipper_company_id uuid,
  status public.load_status,
  origin_address text,
  origin_city text,
  origin_state text,
  origin_place_id text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_city text,
  destination_state text,
  destination_place_id text,
  destination_lat double precision,
  destination_lng double precision,
  pickup_window_start timestamptz,
  pickup_window_end timestamptz,
  delivery_window_start timestamptz,
  delivery_window_end timestamptz,
  cargo_type public.cargo_type,
  description text,
  weight_kg numeric,
  volume_m3 numeric,
  unit_type public.unit_type,
  special_requirements public.special_requirement[],
  proposed_price_cents bigint,
  notes text,
  accepted_offer_id uuid,
  carrier_company_id uuid,
  agreed_price_cents bigint,
  contracted_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
  brokered boolean,
  brokered_status public.brokered_quote_status,
  target_price_cents bigint,
  quoted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id, l.shipper_company_id, l.status,
    l.origin_address, l.origin_city, l.origin_state, l.origin_place_id, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_city, l.destination_state, l.destination_place_id,
    l.destination_lat, l.destination_lng,
    l.pickup_window_start, l.pickup_window_end, l.delivery_window_start, l.delivery_window_end,
    l.cargo_type, l.description, l.weight_kg, l.volume_m3, l.unit_type, l.special_requirements,
    case when l.brokered then p.client_price_cents else l.proposed_price_cents end,
    l.notes, l.accepted_offer_id, l.carrier_company_id,
    case
      when not l.brokered then l.agreed_price_cents
      when l.agreed_price_cents is not null then p.client_price_cents
    end,
    l.contracted_at, l.published_at, l.cancelled_at, l.cancellation_reason,
    l.created_by, l.created_at, l.updated_at, l.archived_at,
    l.brokered, p.status, p.target_price_cents, p.quoted_at
  from public.loads l
  left join public.load_client_prices p on p.load_id = l.id
  where l.shipper_company_id = public.auth_shipper_company_id();
$$;

revoke all on function public.client_loads() from public, anon;
grant execute on function public.client_loads() to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Fails when an amount agreed with a carrier on a brokered load would be over
-- the client's price (Transport never loses on a load). The caller holds the
-- load's lock.
create function public.assert_brokered_margin(p_load_id uuid, p_amount_cents bigint)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_client_price bigint := (
    select p.client_price_cents from public.load_client_prices p where p.load_id = p_load_id and p.status = 'approved'
  );
begin
  if v_client_price is null then
    raise exception 'the client has not approved its price' using errcode = '55000';
  end if;
  if p_amount_cents > v_client_price then
    raise exception 'the carrier price cannot be over the client price' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_brokered_margin(uuid, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the client sends a load to the platform. The payload is the one of
-- create_load (its price is ignored: the client never sets the carriers'
-- rate); p_target_price_cents is what the client would pay, or null ("Por
-- cotizar"). Approved shippers only, with the pickup window ahead. The load
-- waits as a draft until Transport quotes it and the client approves.
-- Returns the load id.
-- ---------------------------------------------------------------------------
create function public.request_brokered_load(p_load jsonb, p_target_price_cents bigint default null)
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
  if not public.lock_company_approved(v_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;
  if p_target_price_cents is not null and (p_target_price_cents <= 0 or p_target_price_cents > 10000000000) then
    raise exception 'invalid load: target price out of range' using errcode = '22023';
  end if;
  if jsonb_typeof(p_load) is distinct from 'object' then
    raise exception 'invalid load: payload must be an object' using errcode = '22023';
  end if;

  v_load := public.apply_load_payload(v_load, p_load || jsonb_build_object('proposedPriceCents', 0));
  if v_load.pickup_window_end <= clock_timestamp() then
    raise exception 'invalid load: pickup window already ended' using errcode = '22023';
  end if;
  v_load.id := gen_random_uuid();

  begin
    insert into public.loads (
      id, shipper_company_id, status, brokered,
      origin_address, origin_city, origin_state, origin_place_id, origin_lat, origin_lng,
      destination_address, destination_city, destination_state, destination_place_id, destination_lat, destination_lng,
      pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
      cargo_type, description, weight_kg, volume_m3, unit_type, special_requirements, proposed_price_cents, notes,
      created_by
    ) values (
      v_load.id, v_company_id, 'draft', true,
      v_load.origin_address, v_load.origin_city, v_load.origin_state, v_load.origin_place_id,
      v_load.origin_lat, v_load.origin_lng,
      v_load.destination_address, v_load.destination_city, v_load.destination_state, v_load.destination_place_id,
      v_load.destination_lat, v_load.destination_lng,
      v_load.pickup_window_start, v_load.pickup_window_end, v_load.delivery_window_start, v_load.delivery_window_end,
      v_load.cargo_type, v_load.description, v_load.weight_kg, v_load.volume_m3, v_load.unit_type,
      coalesce(v_load.special_requirements, '{}'), 0, v_load.notes,
      (select auth.uid())
    );
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'invalid load: % violated', v_constraint using errcode = '22023';
  end;

  insert into public.load_client_prices (load_id, shipper_company_id, target_price_cents)
  values (v_load.id, v_company_id, p_target_price_cents);

  perform public.notify_admins('brokered_load_requested', public.load_route_data(v_load.id));
  return v_load.id;
end;
$$;

revoke all on function public.request_brokered_load(jsonb, bigint) from public, anon;
grant execute on function public.request_brokered_load(jsonb, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: an admin quotes a brokered load: the client's price and the carriers'
-- rate (at most the client's price). Before the client approves, both can
-- change (the client is told each time its price changes); once approved and
-- published, only the rate does (pending offers keep their amounts) until
-- the load is contracted. Audited (loads and load_client_prices triggers).
-- ---------------------------------------------------------------------------
create function public.admin_quote_brokered_load(
  p_load_id uuid,
  p_client_price_cents bigint,
  p_carrier_price_cents bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_load public.loads;
  v_quote public.load_client_prices;
begin
  if not public.is_admin() then
    raise exception 'only admins quote brokered loads' using errcode = '42501';
  end if;
  if p_client_price_cents is null or p_client_price_cents <= 0 or p_client_price_cents > 10000000000
     or p_carrier_price_cents is null or p_carrier_price_cents <= 0 or p_carrier_price_cents > 10000000000 then
    raise exception 'invalid quote: prices out of range' using errcode = '22023';
  end if;
  if p_carrier_price_cents > p_client_price_cents then
    raise exception 'invalid quote: the carrier price cannot be over the client price' using errcode = '22023';
  end if;

  select * into v_load from public.loads where id = p_load_id and brokered and archived_at is null for update;
  if not found then
    raise exception 'load not found' using errcode = 'P0002';
  end if;
  select * into v_quote from public.load_client_prices where load_id = v_load.id for update;
  if v_load.pickup_window_end <= clock_timestamp() then
    raise exception 'pickup window already ended' using errcode = '55000';
  end if;

  if v_load.status = 'draft' and v_quote.status in ('requested', 'quoted') then
    update public.loads set proposed_price_cents = p_carrier_price_cents where id = v_load.id;
    update public.load_client_prices
    set status = 'quoted', client_price_cents = p_client_price_cents, quoted_at = now(), quoted_by = (select auth.uid())
    where id = v_quote.id;
    if v_quote.client_price_cents is distinct from p_client_price_cents then
      perform public.notify_company(
        v_load.shipper_company_id, 'shipper', 'brokered_load_quoted',
        jsonb_build_object('amountCents', p_client_price_cents) || public.load_route_data(v_load.id)
      );
    end if;
  elsif v_load.status in ('published', 'negotiating') and v_quote.status = 'approved' then
    if p_client_price_cents <> v_quote.client_price_cents then
      raise exception 'the client already approved its price' using errcode = '55000';
    end if;
    update public.loads set proposed_price_cents = p_carrier_price_cents
    where id = v_load.id and proposed_price_cents <> p_carrier_price_cents;
  else
    raise exception 'cannot quote a load in status %', v_load.status using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.admin_quote_brokered_load(uuid, bigint, bigint) from public, anon;
grant execute on function public.admin_quote_brokered_load(uuid, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the client approves the price Transport quoted (the one it saw: if the
-- admin changed it meanwhile, it fails and the client sees the new one). The
-- load is published to the carriers at the carriers' rate.
-- ---------------------------------------------------------------------------
create function public.approve_brokered_quote(p_load_id uuid, p_client_price_cents bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_load public.loads;
  v_quote public.load_client_prices;
begin
  select * into v_load from public.loads
  where id = p_load_id and shipper_company_id = public.auth_shipper_company_id() and brokered and archived_at is null
  for update;
  if not found then
    raise exception 'load not found' using errcode = '42501';
  end if;
  select * into v_quote from public.load_client_prices where load_id = v_load.id for update;
  if not public.lock_company_approved(v_load.shipper_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;
  if v_load.status <> 'draft' or v_quote.status <> 'quoted' then
    raise exception 'there is no quote to approve' using errcode = '55000';
  end if;
  if p_client_price_cents is distinct from v_quote.client_price_cents then
    raise exception 'the quote changed' using errcode = '55000';
  end if;
  if v_load.pickup_window_end <= clock_timestamp() then
    raise exception 'pickup window already ended' using errcode = '55000';
  end if;

  update public.load_client_prices
  set status = 'approved', approved_at = now(), approved_by = (select auth.uid())
  where id = v_quote.id;
  update public.loads set status = 'published', published_at = now() where id = v_load.id;
end;
$$;

revoke all on function public.approve_brokered_quote(uuid, bigint) from public, anon;
grant execute on function public.approve_brokered_quote(uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- The client's load RPCs refuse brokered loads (Transport sets their prices
-- and publishes them).
-- ---------------------------------------------------------------------------

-- Same as B05 (20261015160000_loads_negotiation.sql), except a brokered load
-- cannot be edited by the client (it would set the carriers' rate).
create or replace function public.update_load(p_load_id uuid, p_load jsonb)
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
  if v_load.brokered then
    raise exception 'a brokered load cannot be edited' using errcode = '55000';
  end if;
  if v_load.status not in ('draft', 'published', 'negotiating') then
    raise exception 'cannot edit a load in status %', v_load.status using errcode = '55000';
  end if;
  if v_load.status <> 'draft' and not public.lock_company_approved(v_load.shipper_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  v_load := public.apply_load_payload(v_load, p_load);
  if v_load.status <> 'draft' and v_load.pickup_window_end <= clock_timestamp() then
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

-- Same as B05, except a brokered load is published by approve_brokered_quote.
create or replace function public.publish_load(p_load_id uuid)
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
  if v_load.brokered then
    raise exception 'a brokered load is published when its quote is approved' using errcode = '55000';
  end if;
  if not public.lock_company_approved(v_load.shipper_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;
  if v_load.status <> 'draft' then
    raise exception 'cannot publish a load in status %', v_load.status using errcode = '55000';
  end if;
  if v_load.pickup_window_end <= clock_timestamp() then
    raise exception 'pickup window already ended' using errcode = '22023';
  end if;

  update public.loads set status = 'published', published_at = now() where id = v_load.id;
end;
$$;

revoke all on function public.publish_load(uuid) from public, anon;
grant execute on function public.publish_load(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Negotiation: Transport is the shipper side of a brokered load
-- ---------------------------------------------------------------------------

-- Same as G1a.2 (20261026020200_business_unit_rpcs.sql), except that on a
-- brokered load the shipper side is Transport: an admin answers in its name
-- and the client cannot.
create or replace function public.lock_offer_for_response(p_offer_id uuid, p_by text)
returns public.offers
language plpgsql
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_caller_side public.offer_side;
  v_load_status public.load_status;
  v_brokered boolean;
begin
  -- The parties and the load of an offer never change (nor whether the load
  -- is brokered), so the caller is authorized before any lock is taken:
  -- strangers cannot lock other loads.
  select * into v_offer from public.offers where id = p_offer_id;
  v_brokered := found and public.load_is_brokered(v_offer.load_id);
  if found and v_brokered and public.is_admin() then
    v_caller_side := 'shipper';
  elsif found and not v_brokered and v_offer.shipper_company_id = public.auth_shipper_company_id() then
    v_caller_side := 'shipper';
  elsif found and v_offer.carrier_company_id = public.auth_carrier_company_id() and public.can_operate_unit(
    (select n.business_unit_id from public.negotiations n where n.id = v_offer.negotiation_id)
  ) then
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

-- Same as G1a.2, except Transport's counteroffer on a brokered load is never
-- over the client's price.
create or replace function public.counter_offer(p_offer_id uuid, p_amount_cents bigint, p_conditions text default null, p_vehicle_id uuid default null)
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
  perform public.assert_vehicle_in_unit(
    p_vehicle_id, (select n.business_unit_id from public.negotiations n where n.id = v_offer.negotiation_id)
  );
  if v_side = 'shipper' and public.load_is_brokered(v_offer.load_id) then
    perform public.assert_brokered_margin(v_offer.load_id, p_amount_cents);
  end if;

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

-- Same as B16 (20261017000000_admin_operations.sql), except that a brokered
-- load is never contracted over the client's price, and its client is told
-- that Transport found the carrier (without any amount).
create or replace function public.apply_offer_acceptance(p_offer public.offers)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_brokered boolean := public.load_is_brokered(p_offer.load_id);
  v_trip_id uuid;
begin
  perform public.assert_pickup_open(p_offer.load_id);
  if v_brokered then
    perform public.assert_brokered_margin(p_offer.load_id, p_offer.amount_cents);
  end if;
  -- Share-locks both companies (always shipper, then carrier) so neither can be
  -- suspended between this check and the commit.
  if not public.lock_company_approved(p_offer.shipper_company_id)
     or not public.lock_company_approved(p_offer.carrier_company_id) then
    raise exception 'both companies must be approved to contract' using errcode = '55000';
  end if;

  update public.offers
  set status = 'accepted', responded_by = v_uid, responded_at = now()
  where id = p_offer.id;

  update public.offers
  set status = 'rejected', status_reason = 'other_offer_accepted', responded_by = v_uid, responded_at = now()
  where load_id = p_offer.load_id and status = 'pending' and id <> p_offer.id;

  update public.loads
  set status = 'contracted',
      accepted_offer_id = p_offer.id,
      carrier_company_id = p_offer.carrier_company_id,
      agreed_price_cents = p_offer.amount_cents,
      contracted_at = now()
  where id = p_offer.load_id;

  update public.negotiations set updated_at = now() where id = p_offer.negotiation_id;

  v_trip_id := public.create_trip_for_accepted_offer(p_offer.id);
  if v_brokered then
    perform public.notify_company(
      p_offer.shipper_company_id, 'shipper', 'brokered_load_contracted',
      jsonb_build_object('tripId', v_trip_id) || public.load_route_data(p_offer.load_id)
    );
  end if;
  return v_trip_id;
end;
$$;

revoke all on function public.apply_offer_acceptance(public.offers) from public, anon, authenticated;

-- Same as G1a.2, except that on a brokered load what went to the client goes
-- to the admins (Transport), marked `brokered` so it links to the admin's
-- screen. The client is never told about the carriers' offers.
create or replace function public.notify_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid := (select n.business_unit_id from public.negotiations n where n.id = new.negotiation_id);
  v_brokered boolean := public.load_is_brokered(new.load_id);
  v_data jsonb := jsonb_build_object(
    'offerId', new.id, 'negotiationId', new.negotiation_id, 'amountCents', new.amount_cents, 'side', new.side
  ) || public.load_route_data(new.load_id);
  v_type public.notification_type;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    if new.side = 'carrier' then
      v_type := case when new.parent_offer_id is null then 'offer_received' else 'counter_offer_received' end::public.notification_type;
      if v_brokered then
        perform public.notify_admins(v_type, v_data || jsonb_build_object('brokered', true));
      else
        perform public.notify_company(new.shipper_company_id, 'shipper', v_type, v_data);
      end if;
    else
      perform public.notify_carrier_staff(new.carrier_company_id, v_unit, 'counter_offer_received', v_data);
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    if new.side = 'carrier' then
      perform public.notify_carrier_staff(new.carrier_company_id, v_unit, 'offer_accepted', v_data);
    elsif v_brokered then
      perform public.notify_admins('offer_accepted', v_data || jsonb_build_object('brokered', true));
    else
      perform public.notify_company(new.shipper_company_id, 'shipper', 'offer_accepted', v_data);
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Freight ledger (I3): the margin of a brokered load
-- ---------------------------------------------------------------------------
alter table public.freight_ledgers
  add column margin_cents bigint not null default 0,
  drop constraint freight_ledgers_parts_add_up,
  add constraint freight_ledgers_parts_add_up
    check (commission_cents + carrier_net_cents + margin_cents = client_amount_cents),
  -- A margin only on a brokered load, which has no commission (D39).
  add constraint freight_ledgers_margin_check check (margin_cents >= 0 and (margin_cents = 0 or commission_bps = 0));

comment on column public.freight_ledgers.margin_cents is
  'Brokered loads (I6, D39): the client''s price minus the agreed carrier price, the income of Fulmis instead of a commission. Admins only.';

-- Same as I3 (20261110030100_freight_ledger.sql), except a brokered load: the
-- client's amount is its price, the commission is 0, the carrier's net is the
-- agreed carrier price and the margin is the rest.
create or replace function public.freight_ledger_create(p_trip public.trips)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount bigint;
  v_net bigint;
  v_brokered boolean;
  v_bps integer;
  v_terms smallint;
  v_commission bigint;
  v_due date;
  v_cancelled boolean := p_trip.status = 'cancelled';
begin
  select coalesce(l.agreed_price_cents, o.amount_cents), coalesce(l.brokered, false) into v_net, v_brokered
  from public.offers o
  left join public.loads l on l.id = p_trip.load_id
  where o.id = p_trip.offer_id;
  if v_brokered then
    select p.client_price_cents into v_amount from public.load_client_prices p where p.load_id = p_trip.load_id;
    v_bps := 0;
  else
    v_amount := v_net;
    select c.commission_bps into v_bps from public.companies c where c.id = p_trip.carrier_company_id;
    v_bps := coalesce(v_bps, public.freight_default_commission_bps());
  end if;
  select c.payment_terms_days into v_terms from public.companies c where c.id = p_trip.shipper_company_id;
  v_commission := public.freight_commission_cents(v_amount, v_bps);
  if not v_brokered then
    v_net := v_amount - v_commission;
  end if;
  v_due := public.freight_due_on(p_trip.delivered_at, v_terms);

  insert into public.freight_ledgers (
    trip_id, client_amount_cents, commission_bps, commission_cents, carrier_net_cents, margin_cents,
    client_terms_days, client_due_on, carrier_due_on, client_status, carrier_status
  ) values (
    p_trip.id, v_amount, v_bps, v_commission, v_net, v_amount - v_commission - v_net,
    v_terms, v_due, v_due,
    case when v_cancelled then 'cancelled' else 'pending' end::public.freight_client_status,
    case when v_cancelled then 'cancelled' else 'pending' end::public.freight_carrier_status
  )
  on conflict (trip_id) do nothing;
end;
$$;

revoke all on function public.freight_ledger_create(public.trips) from public, anon, authenticated, service_role;

-- Same as I3, plus the margin (its return type changes, so it is recreated).
drop function public.admin_freight_ledger();

create function public.admin_freight_ledger()
returns table (
  ledger_id uuid,
  trip_id uuid,
  load_id uuid,
  origin_city text,
  destination_city text,
  trip_status public.trip_status,
  delivered_at timestamptz,
  trip_created_at timestamptz,
  shipper_company_id uuid,
  shipper_name text,
  carrier_company_id uuid,
  carrier_name text,
  client_amount_cents bigint,
  commission_bps integer,
  commission_cents bigint,
  carrier_net_cents bigint,
  margin_cents bigint,
  client_terms_days smallint,
  client_due_on date,
  client_status public.freight_client_status,
  client_paid_cents bigint,
  carrier_due_on date,
  carrier_status public.freight_carrier_status,
  carrier_paid_cents bigint,
  needs_review boolean,
  review_note text,
  payments jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins read the freight ledger' using errcode = '42501';
  end if;
  return query
  select f.id, t.id, t.load_id, l.origin_city, l.destination_city, t.status, t.delivered_at, t.created_at,
         t.shipper_company_id, sc.legal_name, t.carrier_company_id, cc.legal_name,
         f.client_amount_cents, f.commission_bps, f.commission_cents, f.carrier_net_cents, f.margin_cents,
         f.client_terms_days, f.client_due_on,
         public.freight_effective_client_status(f.client_status, f.client_due_on), f.client_paid_cents,
         f.carrier_due_on,
         public.freight_effective_carrier_status(f.carrier_status, f.carrier_due_on, f.client_status),
         f.carrier_paid_cents, f.needs_review, f.review_note,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'id', p.id, 'direction', p.direction, 'amountCents', p.amount_cents, 'paidOn', p.paid_on,
             'speiReference', p.spei_reference, 'note', p.note
           ) order by p.paid_on, p.created_at)
           from public.freight_payments p
           where p.ledger_id = f.id
         ), '[]'::jsonb)
  from public.freight_ledgers f
  join public.trips t on t.id = f.trip_id
  join public.loads l on l.id = t.load_id
  join public.companies sc on sc.id = t.shipper_company_id
  join public.companies cc on cc.id = t.carrier_company_id
  order by f.needs_review desc, f.client_due_on nulls last, t.created_at desc, f.id;
end;
$$;

revoke all on function public.admin_freight_ledger() from public, anon;
grant execute on function public.admin_freight_ledger() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: the brokered loads with both prices (the inbox /admin/intermediadas)
-- ---------------------------------------------------------------------------
create function public.admin_brokered_loads()
returns table (
  load_id uuid,
  load_status public.load_status,
  quote_status public.brokered_quote_status,
  shipper_company_id uuid,
  shipper_name text,
  origin_city text,
  destination_city text,
  pickup_window_start timestamptz,
  pickup_window_end timestamptz,
  target_price_cents bigint,
  client_price_cents bigint,
  carrier_price_cents bigint,
  agreed_price_cents bigint,
  pending_offers bigint,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins read the brokered loads' using errcode = '42501';
  end if;
  return query
  select l.id, l.status, p.status, l.shipper_company_id, c.legal_name, l.origin_city, l.destination_city,
         l.pickup_window_start, l.pickup_window_end,
         p.target_price_cents, p.client_price_cents, nullif(l.proposed_price_cents, 0), l.agreed_price_cents,
         (select count(*) from public.offers o where o.load_id = l.id and o.status = 'pending' and o.side = 'carrier'),
         p.created_at
  from public.loads l
  join public.load_client_prices p on p.load_id = l.id
  join public.companies c on c.id = l.shipper_company_id
  where l.brokered and l.archived_at is null
  order by (p.status = 'requested') desc, l.pickup_window_start, l.id;
end;
$$;

revoke all on function public.admin_brokered_loads() from public, anon;
grant execute on function public.admin_brokered_loads() to authenticated;
