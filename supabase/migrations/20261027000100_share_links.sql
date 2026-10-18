-- G7 · Share links (D23, plan §G G7).
--   A coordinator (or the manager) shares a load with the staff and operators
--   of their own company through an internal link that needs a session. The
--   shipper shares a published load, or the tracking of a trip, through a
--   public read-only link: a random token with an expiry that can be revoked,
--   and a sanitized view that never carries the price, contacts, exact
--   addresses, documents, chat or the operator's name or phone.
--
--   Only the SHA-256 of the token is stored. The token itself (32 random
--   bytes, base64url) is returned once by create_share_link and lives in the
--   link. An invalid, expired or revoked token gets the same error, so a
--   visitor cannot tell them apart.

-- ---------------------------------------------------------------------------
-- share_links
-- ---------------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  kind public.share_link_kind not null,
  -- The company of whoever created it: the shipper for the public kinds, the
  -- carrier for the internal one. Its staff list and revoke the links.
  company_id uuid not null references public.companies (id) on delete cascade,
  load_id uuid references public.loads (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete cascade,
  -- sha256 of the token; the token is never stored.
  token_hash bytea not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  constraint share_links_token_hash_key unique (token_hash),
  constraint share_links_token_hash_length check (octet_length(token_hash) = 32),
  constraint share_links_target check (
    (kind in ('load_internal', 'load_public') and load_id is not null and trip_id is null)
    or (kind = 'trip_tracking_public' and trip_id is not null and load_id is null)
  ),
  constraint share_links_expires_after_creation check (expires_at > created_at),
  constraint share_links_view_count check (view_count >= 0)
);

comment on table public.share_links is
  'Links to share a load (internal or public) or the tracking of a trip (public), by token hash (D23).';
comment on column public.share_links.token_hash is
  'sha256 of the base64url token. The token is returned once by create_share_link and never stored.';

create index share_links_company_idx on public.share_links (company_id, created_at desc);
create index share_links_load_idx on public.share_links (load_id) where load_id is not null;
create index share_links_trip_idx on public.share_links (trip_id) where trip_id is not null;

-- Writes only through the RPCs below. The staff of the company reads its own
-- links without the hash (column grant); admins read them all.
revoke all on table public.share_links from anon, authenticated;
grant select (id, kind, company_id, load_id, trip_id, created_by, created_at, expires_at, revoked_at,
              last_viewed_at, view_count)
  on table public.share_links to authenticated;

alter table public.share_links enable row level security;

create policy share_links_select
on public.share_links
for select
to authenticated
using (
  (company_id = (select public.auth_company_id())
   and (select public.auth_role()) in ('shipper', 'manager', 'coordinator'))
  or (select public.is_admin())
);

-- F12-style rate limit: links created per user and minute.
create trigger share_links_rate_limit before insert on public.share_links
for each row execute function public.enforce_rate_limit('create_share_link');

-- Same as F12 (20261025120000_incident_photos_clock_rate_limits.sql), except
-- it adds the create_share_link bucket (docs/seguridad.md).
create or replace function public.rate_limit_policy(
  p_bucket text,
  out scope text,
  out max_hits integer,
  out window_seconds integer
)
language sql
immutable
set search_path = ''
as $$
  select v.scope, v.max_hits, v.window_seconds
  from (values
    -- B08: each call can spend up to 2 x top N Google Routes requests.
    ('recommendations', 'user', 30, 60),
    -- B09: pg_cron calls it once a minute; the margin covers manual runs.
    ('dispatch-notifications', 'service', 10, 60),
    -- F12: client RPCs, per user and minute.
    ('send_message', 'rpc', 60, 60),
    ('report_incident', 'rpc', 20, 60),
    ('add_trip_evidence', 'rpc', 120, 60),
    ('create_load', 'rpc', 30, 60),
    ('offers', 'rpc', 60, 60),
    ('record_trip_locations', 'rpc', 120, 60),
    -- G7: a person shares a handful of links; this only stops scripts.
    ('create_share_link', 'rpc', 30, 60)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

revoke all on function public.rate_limit_policy(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- The link a token points to, when it is usable right now: not revoked, not
-- expired and, for a trip, not more than 24 hours after the trip closed or was
-- cancelled. Null otherwise (the callers raise the same error for every case).
create function public.share_link_by_token(p_token text, p_kind public.share_link_kind)
returns public.share_links
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.share_links s
  left join public.trips t on t.id = s.trip_id
  where p_token is not null
    and p_token ~ '^[A-Za-z0-9_-]{43}$'
    and s.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and s.kind = p_kind
    and s.revoked_at is null
    and s.expires_at > now()
    -- least() ignores nulls: the earlier of the two ends, or null while open.
    and (s.trip_id is null
         or least(t.closed_at, t.cancelled_at) is null
         or least(t.closed_at, t.cancelled_at) + interval '24 hours' > now());
$$;

revoke all on function public.share_link_by_token(text, public.share_link_kind)
  from public, anon, authenticated, service_role;

-- Counts a view. Called by the RPCs that open a link (as the owner).
create function public.share_link_record_view(p_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  update public.share_links
  set view_count = view_count + 1, last_viewed_at = now()
  where id = p_id;
$$;

revoke all on function public.share_link_record_view(uuid) from public, anon, authenticated, service_role;

-- The sanitized JSON of a load for the public link: cities and states, the
-- windows, cargo type, weight, unit type and requirements. Never the price,
-- the addresses, the description, the notes or anything about the parties.
create function public.share_link_public_load(p_load public.loads)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'load',
    'status', p_load.status,
    'origin', jsonb_build_object('city', p_load.origin_city, 'state', p_load.origin_state),
    'destination', jsonb_build_object('city', p_load.destination_city, 'state', p_load.destination_state),
    'pickupWindow', jsonb_build_object('start', p_load.pickup_window_start, 'end', p_load.pickup_window_end),
    'deliveryWindow', jsonb_build_object('start', p_load.delivery_window_start, 'end', p_load.delivery_window_end),
    'cargoType', p_load.cargo_type,
    'weightKg', p_load.weight_kg,
    'unitType', p_load.unit_type,
    'specialRequirements', to_jsonb(p_load.special_requirements)
  );
$$;

revoke all on function public.share_link_public_load(public.loads) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: create_share_link
-- ---------------------------------------------------------------------------
-- Who creates each kind:
--   load_internal         the manager or a coordinator of an approved carrier,
--                         for a load they see: published or negotiating, or
--                         negotiated / carried by one of their business units
--   load_public           the shipper that owns the load, while it is published
--                         or negotiating
--   trip_tracking_public  the shipper of the trip, unless it is cancelled
-- Validity: p_valid_for_hours between 1 and 720 (30 days); null takes the
-- default of the kind: 72 h for the internal link, 7 days for a public load
-- and 30 days for the tracking, which besides stops working 24 h after the
-- trip closes (share_link_by_token).
create function public.create_share_link(
  p_kind public.share_link_kind,
  p_load_id uuid default null,
  p_trip_id uuid default null,
  p_valid_for_hours integer default null
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_company_id uuid;
  v_units uuid[];
  v_hours integer;
  v_token text;
  v_id uuid;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_valid_for_hours is not null and p_valid_for_hours not between 1 and 720 then
    raise exception 'p_valid_for_hours must be between 1 and 720' using errcode = '22023';
  end if;

  if p_kind = 'trip_tracking_public' then
    if p_trip_id is null or p_load_id is not null then
      raise exception 'a tracking link takes p_trip_id only' using errcode = '22023';
    end if;
  elsif p_load_id is null or p_trip_id is not null then
    raise exception 'a load link takes p_load_id only' using errcode = '22023';
  end if;

  if p_kind = 'load_internal' then
    v_company_id := public.auth_carrier_company_id();
    v_units := public.auth_business_unit_ids();
    if v_company_id is null
       or not public.is_company_approved()
       or not exists (
         select 1 from public.loads l
         where l.id = p_load_id
           and l.archived_at is null
           and (
             l.status in ('published', 'negotiating')
             or exists (select 1 from public.negotiations n
                        where n.load_id = l.id and n.carrier_company_id = v_company_id
                          and n.business_unit_id = any (v_units)
                          and (l.carrier_company_id is null or l.carrier_company_id = v_company_id))
             or exists (select 1 from public.trips t
                        where t.load_id = l.id and t.carrier_company_id = v_company_id
                          and t.business_unit_id = any (v_units))
           )
       ) then
      raise exception 'load not found' using errcode = '42501';
    end if;
    v_hours := coalesce(p_valid_for_hours, 72);
  elsif p_kind = 'load_public' then
    v_company_id := public.auth_shipper_company_id();
    if v_company_id is null or not exists (
      select 1 from public.loads l
      where l.id = p_load_id and l.shipper_company_id = v_company_id and l.archived_at is null
    ) then
      raise exception 'load not found' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.loads l where l.id = p_load_id and l.status in ('published', 'negotiating')
    ) then
      raise exception 'only a published load can be shared' using errcode = '22023';
    end if;
    v_hours := coalesce(p_valid_for_hours, 24 * 7);
  else
    v_company_id := public.auth_shipper_company_id();
    if v_company_id is null or not exists (
      select 1 from public.trips t where t.id = p_trip_id and t.shipper_company_id = v_company_id
    ) then
      raise exception 'trip not found' using errcode = '42501';
    end if;
    if exists (select 1 from public.trips t where t.id = p_trip_id and t.status = 'cancelled') then
      raise exception 'a cancelled trip cannot be shared' using errcode = '22023';
    end if;
    v_hours := coalesce(p_valid_for_hours, 24 * 30);
  end if;

  -- 32 random bytes (256 bits) as base64url without padding: 43 characters.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_expires_at := now() + make_interval(hours => v_hours);

  insert into public.share_links (kind, company_id, load_id, trip_id, token_hash, created_by, expires_at)
  values (p_kind, v_company_id, p_load_id, p_trip_id, sha256(convert_to(v_token, 'UTF8')), v_uid, v_expires_at)
  returning share_links.id into v_id;

  return query select v_id, v_token, v_expires_at;
end;
$$;

revoke all on function public.create_share_link(public.share_link_kind, uuid, uuid, integer) from public, anon;
grant execute on function public.create_share_link(public.share_link_kind, uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: revoke_share_link
-- ---------------------------------------------------------------------------
-- The staff of the company that created a link revokes it (a shipper, or the
-- manager and coordinators of the carrier). Revoking twice is a no-op.
create function public.revoke_share_link(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_company_id uuid := public.auth_company_id();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_company_id is null
     or public.auth_role() not in ('shipper', 'manager', 'coordinator')
     or not exists (select 1 from public.share_links s where s.id = p_id and s.company_id = v_company_id) then
    raise exception 'share link not found' using errcode = '42501';
  end if;

  update public.share_links
  set revoked_at = now()
  where id = p_id and company_id = v_company_id and revoked_at is null;
end;
$$;

revoke all on function public.revoke_share_link(uuid) from public, anon;
grant execute on function public.revoke_share_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: open_internal_share (authenticated)
-- ---------------------------------------------------------------------------
-- Opens an internal link: the caller must belong to the company that shared
-- it (manager, coordinator or operator), and the load must not be contracted
-- by another carrier. Returns the load as the carrier sees it (with the
-- proposed price: it is the same company) and whether the caller
-- may offer on it: carrier staff, company approved and the load still open.
create function public.open_internal_share(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_link public.share_links;
  v_load public.loads;
  v_can_offer boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_link := public.share_link_by_token(p_token, 'load_internal');
  if v_link.id is null or v_link.company_id is distinct from public.auth_company_id() then
    raise exception 'share link not found' using errcode = '42501';
  end if;

  -- A load another carrier took is no longer theirs to see (loads_select):
  -- the link stops opening once it is contracted by someone else.
  select * into v_load from public.loads l
  where l.id = v_link.load_id
    and l.archived_at is null
    and (l.carrier_company_id is null or l.carrier_company_id = v_link.company_id);
  if not found then
    raise exception 'share link not found' using errcode = '42501';
  end if;

  v_can_offer := public.auth_role() in ('manager', 'coordinator')
    and public.is_company_approved()
    and v_load.status in ('published', 'negotiating');

  perform public.share_link_record_view(v_link.id);

  return jsonb_build_object(
    'kind', 'load_internal',
    'loadId', v_load.id,
    'canOffer', v_can_offer,
    'status', v_load.status,
    'origin', jsonb_build_object('city', v_load.origin_city, 'state', v_load.origin_state),
    'destination', jsonb_build_object('city', v_load.destination_city, 'state', v_load.destination_state),
    'pickupWindow', jsonb_build_object('start', v_load.pickup_window_start, 'end', v_load.pickup_window_end),
    'deliveryWindow', jsonb_build_object('start', v_load.delivery_window_start, 'end', v_load.delivery_window_end),
    'cargoType', v_load.cargo_type,
    'description', v_load.description,
    'weightKg', v_load.weight_kg,
    'volumeM3', v_load.volume_m3,
    'unitType', v_load.unit_type,
    'specialRequirements', to_jsonb(v_load.special_requirements),
    'proposedPriceCents', v_load.proposed_price_cents,
    'notes', v_load.notes,
    'expiresAt', v_link.expires_at
  );
end;
$$;

revoke all on function public.open_internal_share(text) from public, anon;
grant execute on function public.open_internal_share(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: public_shared_load (anon)
-- ---------------------------------------------------------------------------
-- The sanitized load behind a public link: share_link_public_load. The same
-- error for an unknown, expired or revoked token.
create function public.public_shared_load(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
  v_load public.loads;
begin
  v_link := public.share_link_by_token(p_token, 'load_public');
  if v_link.id is null then
    raise exception 'share link not found' using errcode = '42501';
  end if;
  select * into v_load from public.loads l where l.id = v_link.load_id and l.archived_at is null;
  if not found then
    raise exception 'share link not found' using errcode = '42501';
  end if;

  perform public.share_link_record_view(v_link.id);

  return public.share_link_public_load(v_load) || jsonb_build_object('expiresAt', v_link.expires_at);
end;
$$;

revoke all on function public.public_shared_load(text) from public;
grant execute on function public.public_shared_load(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: public_shared_trip (anon)
-- ---------------------------------------------------------------------------
-- The sanitized tracking behind a public link: the trip's status, the route
-- as cities and states, the windows, the timeline (event types and times, no
-- notes), the last position only while the trip is active, the estimated end
-- of unloading, the carrier's legal name, the unit type and the plate masked
-- to its last 3 characters. Never the price, the addresses, the documents,
-- the chat, the incidents' details or the operator.
create function public.public_shared_trip(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
  v_trip public.trips;
  v_load public.loads;
  v_timeline jsonb;
  v_position jsonb;
  v_carrier_name text;
  v_unit_type public.unit_type;
  v_plate text;
begin
  v_link := public.share_link_by_token(p_token, 'trip_tracking_public');
  if v_link.id is null then
    raise exception 'share link not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips t where t.id = v_link.trip_id;
  if not found then
    raise exception 'share link not found' using errcode = '42501';
  end if;
  select * into v_load from public.loads l where l.id = v_trip.load_id;

  select coalesce(jsonb_agg(jsonb_build_object('type', e.event_type, 'occurredAt', e.occurred_at)
                            order by e.occurred_at, e.recorded_at), '[]'::jsonb)
  into v_timeline
  from public.trip_events e
  where e.trip_id = v_trip.id;

  -- Only while the unit is on the road (same rule as the shipper's map, B15).
  if public.trip_is_active(v_trip.status) then
    select jsonb_build_object('lat', p.latitude, 'lng', p.longitude, 'recordedAt', p.recorded_at)
    into v_position
    from public.trip_locations p
    where p.trip_id = v_trip.id
    order by p.recorded_at desc
    limit 1;
  end if;

  select c.legal_name into v_carrier_name from public.companies c where c.id = v_trip.carrier_company_id;
  select v.unit_type, v.plate into v_unit_type, v_plate from public.vehicles v where v.id = v_trip.vehicle_id;

  perform public.share_link_record_view(v_link.id);

  return jsonb_build_object(
    'kind', 'trip',
    'status', v_trip.status,
    'origin', jsonb_build_object('city', v_load.origin_city, 'state', v_load.origin_state),
    'destination', jsonb_build_object('city', v_load.destination_city, 'state', v_load.destination_state),
    'pickupWindow', jsonb_build_object('start', v_load.pickup_window_start, 'end', v_load.pickup_window_end),
    'deliveryWindow', jsonb_build_object('start', v_load.delivery_window_start, 'end', v_load.delivery_window_end),
    'estimatedUnloadEndAt', v_trip.estimated_unload_end_at,
    'carrierName', v_carrier_name,
    'unitType', v_unit_type,
    'plateMasked', case when v_plate is null then null else '***' || right(v_plate, 3) end,
    'timeline', v_timeline,
    'lastPosition', v_position,
    'expiresAt', v_link.expires_at
  );
end;
$$;

revoke all on function public.public_shared_trip(text) from public;
grant execute on function public.public_shared_trip(text) to anon, authenticated;
