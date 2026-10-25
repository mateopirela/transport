-- H2 · Trip link for the operator (D29, plan §H H2).
--   When the trip is assigned, the manager or a coordinator of its business
--   unit sends the operator a link (WhatsApp, SMS, the share sheet) that
--   opens the app on that trip. It reuses the share links of G7 (D23): a
--   random token of 32 bytes of which only the SHA-256 is stored, an expiry
--   and revocation. The link needs a session: it only gets the operator still
--   assigned to the trip (or the staff of the unit) to it, and opens nothing
--   for anyone else. It stops working when the trip closes or is cancelled,
--   when the operator changes, after 30 days, or when revoked.
--
--   Lock order: the trip row, then its share links (the same order as
--   assign_trip, whose update of the trip revokes the link through the
--   trigger below), so creating a link and reassigning never deadlock.

-- ---------------------------------------------------------------------------
-- share_links: the operator of a trip link
-- ---------------------------------------------------------------------------
-- Additive: a nullable column and a wider check (every existing row has
-- operator_id null and is one of the G7 kinds, so it passes).
alter table public.share_links
  add column operator_id uuid references public.operators (id) on delete cascade;

comment on column public.share_links.operator_id is
  'The operator a trip_operator link was sent to (H2); null for the other kinds.';

alter table public.share_links drop constraint share_links_target;
alter table public.share_links add constraint share_links_target check (
  (kind in ('load_internal', 'load_public') and load_id is not null and trip_id is null
   and operator_id is null)
  or (kind = 'trip_tracking_public' and trip_id is not null and load_id is null and operator_id is null)
  or (kind = 'trip_operator' and trip_id is not null and load_id is null and operator_id is not null)
);

-- One live operator link per trip: issuing a new one revokes the previous.
create unique index share_links_trip_operator_active_key
  on public.share_links (trip_id)
  where kind = 'trip_operator' and revoked_at is null;

create index share_links_operator_idx on public.share_links (operator_id) where operator_id is not null;

-- The staff of the company reads operator_id too (no token_hash, as in G7).
grant select (operator_id) on table public.share_links to authenticated;

-- Same as G2 (20261028060100_document_shares_provider_approvals.sql), except
-- it adds open_trip_operator_link.
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
    -- G1b: invitation links. Inviting is manual; this stops a script from
    -- minting links in bulk.
    ('create_invitation', 'rpc', 20, 60),
    -- G7: a person shares a handful of links; this only stops scripts.
    ('create_share_link', 'rpc', 30, 60),
    -- G2: redeeming a link (Edge Function), per IP and per token, 10 minutes.
    ('redeem-invitation-ip', 'service', 20, 600),
    ('redeem-invitation-token', 'service', 5, 600),
    -- G6: Edge Function shared-document-url, per user and minute.
    ('shared_document_url', 'user', 30, 60),
    -- H2: opening a trip link; a person opens it a few times a day.
    ('open_trip_operator_link', 'rpc', 30, 60)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

revoke all on function public.rate_limit_policy(text) from public, anon, authenticated, service_role;

-- Trip statuses in which the operator link can be issued: assigned and on the
-- road, until the unloading ends (D29).
create function public.trip_operator_link_issuable(p_status public.trip_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('assigned', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit',
                      'at_delivery', 'unloading');
$$;

revoke all on function public.trip_operator_link_issuable(public.trip_status)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: create_trip_operator_link
-- ---------------------------------------------------------------------------
-- The manager, or a coordinator who operates the trip's business unit,
-- issues the link for the operator assigned to the trip, while it is between
-- `assigned` and `unloading`. Issuing it again revokes the previous one. It
-- lasts 30 days (the maximum of G7), and the trigger below revokes it before
-- if the trip ends or the operator changes. Rate limited by the insert
-- trigger of share_links (create_share_link bucket).
create function public.create_trip_operator_link(p_trip_id uuid)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_trip public.trips;
  v_token text;
  v_id uuid;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Checked before the lock, so no one locks a trip they cannot see.
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and t.carrier_company_id = public.auth_carrier_company_id()
      and public.can_operate_unit(t.business_unit_id)
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  -- The trip first, as assign_trip: a reassignment waits for this link (and
  -- then revokes it), or this waits for the reassignment (and sees the new
  -- operator).
  select * into v_trip from public.trips t where t.id = p_trip_id for update;
  -- Re-checked under the lock: the manager may have moved it meanwhile.
  if not found
     or v_trip.carrier_company_id is distinct from public.auth_carrier_company_id()
     or not public.can_operate_unit(v_trip.business_unit_id) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  if v_trip.operator_id is null or not public.trip_operator_link_issuable(v_trip.status) then
    raise exception 'the trip has no operator on it' using errcode = '55000';
  end if;

  update public.share_links s
  set revoked_at = now()
  where s.trip_id = v_trip.id and s.kind = 'trip_operator' and s.revoked_at is null;

  -- 32 random bytes (256 bits) as base64url without padding: 43 characters.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_expires_at := now() + interval '30 days';

  insert into public.share_links (kind, company_id, trip_id, operator_id, token_hash, created_by, expires_at)
  values ('trip_operator', v_trip.carrier_company_id, v_trip.id, v_trip.operator_id,
          sha256(convert_to(v_token, 'UTF8')), v_uid, v_expires_at)
  returning share_links.id into v_id;

  return query select v_id, v_token, v_expires_at;
end;
$$;

revoke all on function public.create_trip_operator_link(uuid) from public, anon;
grant execute on function public.create_trip_operator_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: open_trip_operator_link (authenticated)
-- ---------------------------------------------------------------------------
-- Where a trip link takes the signed-in caller: `operator` when they are the
-- operator it was sent to and still assigned to the trip; `carrier` when they
-- are the manager or a coordinator of the trip's business unit (their trip
-- detail). Anything else (unknown, expired or revoked token, a trip that
-- closed or was cancelled, another operator, another company, the shipper)
-- gets the same error with no ids, so the link tells nothing to whoever is
-- not meant to open it. Counts the view. Rate limited per user: a failed call
-- rolls its hit back with the rest of the transaction, but the 256-bit token
-- cannot be guessed; the limit only stops a script from replaying links.
create function public.open_trip_operator_link(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_policy record;
  v_retry integer;
  v_link public.share_links;
  v_trip public.trips;
  v_target text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_policy from public.rate_limit_policy('open_trip_operator_link');
  v_retry := public.rate_limit_hit('open_trip_operator_link', v_uid::text, v_policy.max_hits,
                                   v_policy.window_seconds);
  if v_retry > 0 then
    raise exception 'rate limit exceeded'
      using errcode = 'PT429',
            detail = format('open_trip_operator_link: at most %s per %s seconds',
                            v_policy.max_hits, v_policy.window_seconds),
            hint = format('retry after %s seconds', v_retry);
  end if;

  v_link := public.share_link_by_token(p_token, 'trip_operator');
  if v_link.id is not null then
    select * into v_trip from public.trips t where t.id = v_link.trip_id;
  end if;

  if v_trip.id is not null and v_trip.status not in ('pending_assignment', 'closed', 'cancelled') then
    if v_link.operator_id = public.auth_operator_id() and v_trip.operator_id = v_link.operator_id then
      v_target := 'operator';
    elsif v_trip.carrier_company_id = public.auth_carrier_company_id()
          and public.can_operate_unit(v_trip.business_unit_id) then
      v_target := 'carrier';
    end if;
  end if;

  if v_target is null then
    raise exception 'invalid or expired link' using errcode = '22023';
  end if;

  perform public.share_link_record_view(v_link.id);

  return jsonb_build_object('tripId', v_trip.id, 'target', v_target);
end;
$$;

revoke all on function public.open_trip_operator_link(text) from public, anon;
grant execute on function public.open_trip_operator_link(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: revoke_share_link
-- ---------------------------------------------------------------------------
-- Same as G7 (20261027020100_share_links.sql), except a trip_operator link is
-- revoked only by the manager or a coordinator of the trip's business unit,
-- like it is issued (a coordinator of another unit cannot revoke it).
create or replace function public.revoke_share_link(p_id uuid)
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
     or not exists (
       select 1 from public.share_links s
       left join public.trips t on t.id = s.trip_id
       where s.id = p_id and s.company_id = v_company_id
         and (s.kind <> 'trip_operator' or public.can_operate_unit(t.business_unit_id))
     ) then
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
-- Trigger: the link ends with the trip or the operator
-- ---------------------------------------------------------------------------
-- When the trip closes or is cancelled, or its operator changes, the live
-- operator link is revoked. Runs inside the update of the trip, so under its
-- lock (assign_trip, cancel_trip, close and the admin RPCs all update it).
create function public.revoke_trip_operator_link()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.share_links s
  set revoked_at = now()
  where s.trip_id = new.id and s.kind = 'trip_operator' and s.revoked_at is null;
  return null;
end;
$$;

revoke all on function public.revoke_trip_operator_link() from public, anon, authenticated, service_role;

create trigger trips_revoke_operator_link
after update of status, operator_id on public.trips
for each row
when (
  new.operator_id is distinct from old.operator_id
  or (new.status in ('closed', 'cancelled') and new.status is distinct from old.status)
)
execute function public.revoke_trip_operator_link();
