-- G6 · Documents shared with the shipper, provider approval and the notices of
-- JP's flow (D21, D22).
--
--   * document_shares: once an offer is accepted the shipper of the trip gets
--     read-only access to the carrier's approved, current documents whose
--     requirement is shareable_with_shipper (G3: never the ids, which are
--     personal data); once a unit and an operator are assigned, to theirs too.
--     Triggers keep the shares in step with the trip (reassigning revokes the
--     previous unit's and operator's; closing or cancelling revokes all) and
--     with the documents (one that stops being approved and current is
--     revoked; its replacement is shared when it is approved). The manager
--     revokes by hand with revoke_document_share. Clients never write them.
--   * The shipper never gets Storage permissions on `documents`. It lists its
--     shares with trip_shared_documents (no storage paths) and opens one
--     through the Edge Function `shared-document-url`, which calls
--     authorize_shared_document_view_service (service role only): it checks
--     that the share is still in force and that the user is of the trip's
--     shipper, records the view in the immutable document_share_views and
--     returns the path, which the function signs for 60 seconds.
--   * provider_approvals: the status of each shipper–carrier pair ("Pendiente"
--     while there is no row), with its immutable history in
--     provider_approval_events. set_provider_status: only the shipper, and
--     only with a carrier it negotiated with. Informative in V1 (D21): it
--     blocks nothing.
--   * Notifications: documents_shared (shipper), provider_status_changed (the
--     carrier staff of the pair's most recent trip or negotiation) and
--     trip_document_added (the other side of the trip).
--
-- Lock order: trip, then its shares. The trip RPCs lock the trip and the
-- trigger writes its shares. A document's trigger first takes the carrier's
-- share advisory lock (document_shares_lock), then a share lock on every open
-- trip of the carrier in id order, and only then reads or writes shares, so:
--   * it never holds a share a trip RPC waits for (no deadlock);
--   * an approval and an assignment never both miss each other: whichever
--     waits re-reads the other's committed state (the share lock returns the
--     trip's latest version; the assignment's next statement sees the
--     approval);
--   * a new trip (accept_offer) takes the same advisory lock before reading
--     the documents, so a company document approved meanwhile is shared too.
-- Open trips that existed before this migration are filled at the end.

create type public.document_share_reason as enum ('offer_accepted', 'trip_assigned');
create type public.document_share_revoke_reason as enum (
  'trip_closed', 'trip_cancelled', 'reassigned', 'document_replaced', 'manager_revoked'
);
create type public.provider_status as enum ('approved', 'rejected', 'revoked');

-- ---------------------------------------------------------------------------
-- document_shares
-- ---------------------------------------------------------------------------
create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete restrict,
  document_id uuid not null references public.documents (id) on delete restrict,
  shipper_company_id uuid not null references public.companies (id) on delete restrict,
  carrier_company_id uuid not null references public.companies (id) on delete restrict,
  owner_type public.document_owner_type not null,
  owner_id uuid not null,
  granted_at timestamptz not null default now(),
  granted_reason public.document_share_reason not null,
  revoked_at timestamptz,
  revoked_reason public.document_share_revoke_reason,
  revoked_by uuid references auth.users (id) on delete set null,
  constraint document_shares_trip_document_key unique (trip_id, document_id),
  constraint document_shares_revocation_consistent check ((revoked_at is null) = (revoked_reason is null)),
  constraint document_shares_reason_matches_owner
    check ((owner_type = 'company') = (granted_reason = 'offer_accepted'))
);

comment on table public.document_shares is
  'Documents of the carrier shared read-only with the shipper of a trip (D21). Written only by triggers and revoke_document_share.';

create index document_shares_document_idx on public.document_shares (document_id) where revoked_at is null;
create index document_shares_shipper_idx on public.document_shares (shipper_company_id, trip_id);
create index document_shares_carrier_idx on public.document_shares (carrier_company_id, trip_id);

revoke all on table public.document_shares from anon, authenticated;
grant select (id, trip_id, document_id, shipper_company_id, carrier_company_id, owner_type, owner_id,
              granted_at, granted_reason, revoked_at, revoked_reason, revoked_by)
  on table public.document_shares to authenticated;

alter table public.document_shares enable row level security;

-- The shipper of the trip, the staff that operates the trip's business unit
-- and admins. The table has no storage path: reading it opens nothing.
create policy document_shares_select
on public.document_shares
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or exists (
    select 1 from public.trips t
    where t.id = document_shares.trip_id
      and t.carrier_company_id = (select public.auth_carrier_company_id())
      and public.can_operate_unit(t.business_unit_id)
  )
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- document_share_views: immutable log of every time the shipper opened one.
-- ---------------------------------------------------------------------------
create table public.document_share_views (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.document_shares (id) on delete restrict,
  -- No foreign key: the log must survive the deletion of the viewer.
  viewer_id uuid not null,
  viewed_at timestamptz not null default now()
);

comment on table public.document_share_views is
  'Immutable log of the views of a shared document. Written only by authorize_shared_document_view_service.';

create index document_share_views_share_idx on public.document_share_views (share_id, viewed_at desc);

create trigger document_share_views_immutable before update or delete on public.document_share_views
for each row execute function public.reject_mutation();
create trigger document_share_views_no_truncate before truncate on public.document_share_views
for each statement execute function public.reject_mutation();

revoke all on table public.document_share_views from anon, authenticated;
grant select (id, share_id, viewer_id, viewed_at) on table public.document_share_views to authenticated;

alter table public.document_share_views enable row level security;

-- Admins and the manager of the carrier whose document was viewed.
create policy document_share_views_select
on public.document_share_views
for select
to authenticated
using (
  exists (
    select 1 from public.document_shares s
    where s.id = document_share_views.share_id
      and s.carrier_company_id = (select public.auth_fleet_company_id())
  )
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------

-- Whether a document may be shared: approved, current, not superseded, and of
-- an active requirement marked shareable_with_shipper.
create function public.document_is_shareable(p_document_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select d.status = 'approved'
       and d.archived_at is null
       and (d.expires_at is null or d.expires_at > now())
       and (not r.requires_expiry or d.expires_at is not null)
       and r.shareable_with_shipper
       and r.archived_at is null
       and r.owner_type = d.owner_type
    from public.documents d
    join public.document_requirements r on r.id = d.requirement_id
    where d.id = p_document_id
  ), false);
$$;

-- The documents of a trip that should be shared now: the carrier's company
-- documents and those of the assigned unit and operator.
create function public.trip_shareable_documents(p_trip public.trips)
returns table (document_id uuid, owner_type public.document_owner_type, owner_id uuid)
language sql
stable
set search_path = ''
as $$
  select d.id, d.owner_type, d.owner_id
  from public.documents d
  where d.company_id = p_trip.carrier_company_id
    and (
      (d.owner_type = 'company' and d.owner_id = p_trip.carrier_company_id)
      or (d.owner_type = 'vehicle' and d.owner_id = p_trip.vehicle_id)
      or (d.owner_type = 'operator' and d.owner_id = p_trip.operator_id)
    )
    and public.document_is_shareable(d.id);
$$;

-- Whether a share is in force: not revoked, the trip still open, the document
-- still shareable and its owner still the trip's carrier, unit or operator.
-- Checked again on every view, so a race with a reassignment or an expiry
-- never opens a document the shipper should no longer see.
create function public.document_share_active(p_share_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select s.revoked_at is null
       and t.status not in ('closed', 'cancelled')
       and t.carrier_company_id = s.carrier_company_id
       and t.shipper_company_id = s.shipper_company_id
       and d.company_id = s.carrier_company_id
       and d.owner_type = s.owner_type
       and d.owner_id = s.owner_id
       and case s.owner_type
             when 'company' then s.owner_id = t.carrier_company_id
             when 'vehicle' then s.owner_id = t.vehicle_id
             else s.owner_id = t.operator_id
           end
       and public.document_is_shareable(d.id)
    from public.document_shares s
    join public.trips t on t.id = s.trip_id
    join public.documents d on d.id = s.document_id
    where s.id = p_share_id
  ), false);
$$;

-- Brings the shares of a trip in step with it; the caller holds the trip's
-- lock (trip RPCs, or the row being updated). Returns how many were granted.
create function public.sync_trip_document_shares(p_trip public.trips)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_granted integer;
begin
  if p_trip.status in ('closed', 'cancelled') then
    update public.document_shares s
    set revoked_at = now(),
        revoked_reason = case p_trip.status when 'closed' then 'trip_closed' else 'trip_cancelled' end::public.document_share_revoke_reason
    where s.trip_id = p_trip.id and s.revoked_at is null;
    return 0;
  end if;

  -- The unit and the operator that left the trip.
  update public.document_shares s
  set revoked_at = now(), revoked_reason = 'reassigned'
  where s.trip_id = p_trip.id
    and s.revoked_at is null
    and ((s.owner_type = 'vehicle' and s.owner_id is distinct from p_trip.vehicle_id)
      or (s.owner_type = 'operator' and s.owner_id is distinct from p_trip.operator_id));

  -- New shares; a unit or operator that comes back after a reassignment gets
  -- its shares back. A share revoked for any other reason (by the manager, or
  -- because the document stopped being valid) stays revoked.
  with granted as (
    insert into public.document_shares
      (trip_id, document_id, shipper_company_id, carrier_company_id, owner_type, owner_id, granted_reason)
    select p_trip.id, e.document_id, p_trip.shipper_company_id, p_trip.carrier_company_id, e.owner_type, e.owner_id,
           case e.owner_type when 'company' then 'offer_accepted' else 'trip_assigned' end::public.document_share_reason
    from public.trip_shareable_documents(p_trip) e
    on conflict (trip_id, document_id) do update
      set granted_at = now(), revoked_at = null, revoked_reason = null, revoked_by = null
      where public.document_shares.revoked_reason = 'reassigned'
    returning 1
  )
  select count(*)::integer into v_granted from granted;
  return v_granted;
end;
$$;

create function public.notify_documents_shared(p_trip public.trips, p_count integer)
returns void
language sql
set search_path = ''
as $$
  select public.notify_company(
    p_trip.shipper_company_id, 'shipper', 'documents_shared',
    jsonb_build_object('tripId', p_trip.id, 'count', p_count) || public.load_route_data(p_trip.load_id)
  )
  where p_count > 0;
$$;

-- Serializes the share writes of one carrier between a document's review and
-- the creation of a trip (both read what the other writes).
create function public.document_shares_lock(p_carrier_company_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('document_shares:' || p_carrier_company_id::text, 0));
$$;

revoke all on function public.document_shares_lock(uuid) from public, anon, authenticated;
revoke all on function public.document_is_shareable(uuid) from public, anon, authenticated;
revoke all on function public.trip_shareable_documents(public.trips) from public, anon, authenticated;
revoke all on function public.document_share_active(uuid) from public, anon, authenticated;
revoke all on function public.sync_trip_document_shares(public.trips) from public, anon, authenticated;
revoke all on function public.notify_documents_shared(public.trips, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Trip created (accept_offer), assigned or reassigned, closed or cancelled.
create function public.trips_sync_document_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = old.status
     and new.vehicle_id is not distinct from old.vehicle_id
     and new.operator_id is not distinct from old.operator_id then
    return null;
  end if;
  -- A new trip is invisible to a document review running meanwhile: take the
  -- carrier's lock first, so the next statement sees an approval it waited for.
  if tg_op = 'INSERT' then
    perform public.document_shares_lock(new.carrier_company_id);
  end if;
  perform public.notify_documents_shared(new, public.sync_trip_document_shares(new));
  return null;
end;
$$;

revoke all on function public.trips_sync_document_shares() from public, anon, authenticated;

create trigger trips_sync_document_shares
after insert or update of status, vehicle_id, operator_id on public.trips
for each row execute function public.trips_sync_document_shares();

-- A document reviewed, superseded or with a new expiry: revoke it when it is
-- no longer shareable; share it with the open trips of its owner when it is.
-- Locks (see the header): the carrier's advisory lock, then every open trip of
-- the carrier in id order, then the shares.
create function public.documents_sync_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shareable boolean := public.document_is_shareable(new.id);
  v_trip public.trips;
  v_granted integer;
begin
  -- A document that is not shareable and was not approved and current before
  -- (a new submission, or a rejection) has no shares to revoke, and no trip
  -- RPC can be sharing it: they read the committed row, which this one locks.
  if not v_shareable
     and (tg_op = 'INSERT' or old.status <> 'approved' or old.archived_at is not null) then
    return null;
  end if;

  perform public.document_shares_lock(new.company_id);
  -- Every open trip, not only those of the owner: the share lock waits for an
  -- assignment in progress and returns the trip as it committed, so a trip
  -- that just got this unit or operator is not missed.
  for v_trip in
    select t.*
    from public.trips t
    where t.carrier_company_id = new.company_id
      and t.status not in ('closed', 'cancelled')
    order by t.id
    for share of t
  loop
    if not v_shareable then
      update public.document_shares s
      set revoked_at = now(), revoked_reason = 'document_replaced'
      where s.trip_id = v_trip.id and s.document_id = new.id and s.revoked_at is null;
    elsif v_trip.status not in ('closed', 'cancelled')
          and (new.owner_type = 'company' and new.owner_id = v_trip.carrier_company_id
               or new.owner_type = 'vehicle' and new.owner_id is not distinct from v_trip.vehicle_id
               or new.owner_type = 'operator' and new.owner_id is not distinct from v_trip.operator_id) then
      insert into public.document_shares
        (trip_id, document_id, shipper_company_id, carrier_company_id, owner_type, owner_id, granted_reason)
      values (v_trip.id, new.id, v_trip.shipper_company_id, v_trip.carrier_company_id, new.owner_type, new.owner_id,
              case new.owner_type when 'company' then 'offer_accepted' else 'trip_assigned' end::public.document_share_reason)
      on conflict (trip_id, document_id) do nothing;
      get diagnostics v_granted = row_count;
      perform public.notify_documents_shared(v_trip, v_granted);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.documents_sync_shares() from public, anon, authenticated;

create trigger documents_sync_shares
after insert or update of status, archived_at, expires_at on public.documents
for each row execute function public.documents_sync_shares();

-- The shares of the open trips, without notifying (the trips existed before
-- the shares did). Run once below for the trips that predate this migration;
-- idempotent. Returns how many were granted.
create function public.backfill_document_shares()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_total integer := 0;
begin
  for v_trip in
    select t.* from public.trips t
    where t.status not in ('closed', 'cancelled')
    order by t.id
    for share of t
  loop
    v_total := v_total + public.sync_trip_document_shares(v_trip);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.backfill_document_shares() from public, anon, authenticated;

select public.backfill_document_shares();

-- ---------------------------------------------------------------------------
-- RPC: the documents shared on a trip, without storage paths. The shipper of
-- the trip sees the shares in force; the staff that operates the trip's
-- business unit and admins also see the revoked ones, with the reason.
-- ---------------------------------------------------------------------------
create function public.trip_shared_documents(p_trip_id uuid)
returns table (
  share_id uuid,
  owner_type public.document_owner_type,
  owner_label text,
  requirement_code text,
  requirement_name text,
  mime_type text,
  expires_at timestamptz,
  granted_at timestamptz,
  granted_reason public.document_share_reason,
  revoked_at timestamptz,
  revoked_reason public.document_share_revoke_reason,
  active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_shipper boolean;
  v_staff boolean;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  v_shipper := found and v_trip.shipper_company_id is not distinct from public.auth_shipper_company_id()
               and public.auth_shipper_company_id() is not null;
  v_staff := found and public.auth_carrier_company_id() is not null
             and v_trip.carrier_company_id = public.auth_carrier_company_id()
             and public.can_operate_unit(v_trip.business_unit_id);
  if not (coalesce(v_shipper, false) or coalesce(v_staff, false) or (found and public.is_admin())) then
    raise exception 'trip not found' using errcode = '42501';
  end if;

  return query
  select x.id, x.owner_type, x.owner_label, x.code, x.name, x.mime_type, x.expires_at, x.granted_at,
         x.granted_reason, x.revoked_at, x.revoked_reason, x.active
  from (
    select s.id, s.owner_type,
           case s.owner_type
             when 'company' then null
             when 'vehicle' then (select v.plate from public.vehicles v where v.id = s.owner_id)
             else (select o.full_name from public.operators o where o.id = s.owner_id)
           end as owner_label,
           r.code, r.name, d.mime_type, d.expires_at, s.granted_at, s.granted_reason, s.revoked_at, s.revoked_reason,
           public.document_share_active(s.id) as active,
           r.sort_order
    from public.document_shares s
    join public.documents d on d.id = s.document_id
    join public.document_requirements r on r.id = d.requirement_id
    where s.trip_id = v_trip.id
  ) x
  where x.active or v_staff or public.is_admin()
  order by x.active desc, x.owner_type, x.sort_order, x.code, x.granted_at;
end;
$$;

revoke all on function public.trip_shared_documents(uuid) from public, anon;
grant execute on function public.trip_shared_documents(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC (service role only, Edge Function shared-document-url): authorizes one
-- view of a shared document by a user taken from their JWT, records it and
-- returns the object to sign. The same error for an unknown, revoked or
-- foreign share, so nothing is revealed about other trips.
-- ---------------------------------------------------------------------------
create function public.authorize_shared_document_view_service(p_share_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.document_shares;
  v_path text;
begin
  -- The share lock makes a concurrent revocation wait for the view to be logged.
  select * into v_share from public.document_shares where id = p_share_id for share;
  if not found
     or p_user_id is null
     or not exists (
       select 1
       from public.profiles p
       join public.companies c on c.id = p.company_id
       where p.id = p_user_id
         and p.role = 'shipper'
         and p.company_id = v_share.shipper_company_id
         and c.status = 'approved'
         and c.archived_at is null
     )
     or not public.document_share_active(v_share.id) then
    raise exception 'shared document not available' using errcode = '42501';
  end if;

  insert into public.document_share_views (share_id, viewer_id) values (v_share.id, p_user_id);
  select d.storage_path into v_path from public.documents d where d.id = v_share.document_id;
  return v_path;
end;
$$;

revoke all on function public.authorize_shared_document_view_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.authorize_shared_document_view_service(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: the manager of the carrier revokes a share by hand. Idempotent.
-- ---------------------------------------------------------------------------
create function public.revoke_document_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := public.auth_fleet_company_id();
  v_share public.document_shares;
begin
  if v_company is null then
    raise exception 'only the manager revokes a shared document' using errcode = '42501';
  end if;
  select * into v_share from public.document_shares where id = p_share_id for update;
  if not found or v_share.carrier_company_id <> v_company then
    raise exception 'share not found' using errcode = '42501';
  end if;
  if v_share.revoked_at is not null then
    return;
  end if;
  update public.document_shares
  set revoked_at = now(), revoked_reason = 'manager_revoked', revoked_by = (select auth.uid())
  where id = v_share.id;
end;
$$;

revoke all on function public.revoke_document_share(uuid) from public, anon;
grant execute on function public.revoke_document_share(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- provider_approvals and provider_approval_events
-- ---------------------------------------------------------------------------
create table public.provider_approvals (
  shipper_company_id uuid not null references public.companies (id) on delete restrict,
  carrier_company_id uuid not null references public.companies (id) on delete restrict,
  status public.provider_status not null,
  notes text constraint provider_approvals_notes_length check (char_length(notes) <= 1000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (shipper_company_id, carrier_company_id)
);

comment on table public.provider_approvals is
  'Whether a shipper approved a carrier as a provider (D21; no row = pending). Written only by set_provider_status.';

create index provider_approvals_carrier_idx on public.provider_approvals (carrier_company_id);

create table public.provider_approval_events (
  id uuid primary key default gen_random_uuid(),
  shipper_company_id uuid not null,
  carrier_company_id uuid not null,
  status public.provider_status not null,
  notes text,
  -- No foreign key: the history must survive the deletion of the user.
  decided_by uuid,
  -- The clock, not the transaction start: orders two changes of one transaction.
  decided_at timestamptz not null default clock_timestamp(),
  constraint provider_approval_events_pair_fkey foreign key (shipper_company_id, carrier_company_id)
    references public.provider_approvals (shipper_company_id, carrier_company_id) on delete restrict
);

comment on table public.provider_approval_events is
  'Immutable history of provider_approvals. Written only by set_provider_status.';

create index provider_approval_events_pair_idx
  on public.provider_approval_events (shipper_company_id, carrier_company_id, decided_at desc);

create trigger provider_approval_events_immutable before update or delete on public.provider_approval_events
for each row execute function public.reject_mutation();
create trigger provider_approval_events_no_truncate before truncate on public.provider_approval_events
for each statement execute function public.reject_mutation();

revoke all on table public.provider_approvals from anon, authenticated;
grant select (shipper_company_id, carrier_company_id, status, notes, decided_by, decided_at, created_at)
  on table public.provider_approvals to authenticated;
revoke all on table public.provider_approval_events from anon, authenticated;
grant select (id, shipper_company_id, carrier_company_id, status, notes, decided_by, decided_at)
  on table public.provider_approval_events to authenticated;

alter table public.provider_approvals enable row level security;
alter table public.provider_approval_events enable row level security;

-- The shipper, the carrier involved (its manager and coordinators) and admins.
create policy provider_approvals_select
on public.provider_approvals
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_carrier_company_id())
  or (select public.is_admin())
);

create policy provider_approval_events_select
on public.provider_approval_events
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_carrier_company_id())
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- RPC: the shipper approves, rejects or revokes a carrier as its provider.
--   approved: from pending, rejected or revoked; rejected: from pending or
--   revoked; revoked: only from approved. Asking for the current status
--   again changes nothing. Notifies the carrier staff of the pair's most
--   recent trip or negotiation. Returns the status.
-- ---------------------------------------------------------------------------
create function public.set_provider_status(
  p_carrier_company_id uuid,
  p_status public.provider_status,
  p_notes text default null
)
returns public.provider_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipper uuid := public.auth_shipper_company_id();
  v_notes text := nullif(btrim(p_notes), '');
  v_current public.provider_approvals;
  v_last record;
begin
  if v_shipper is null then
    raise exception 'only a shipper approves providers' using errcode = '42501';
  end if;
  -- Only a carrier the shipper negotiated with (every trip has a negotiation).
  if p_carrier_company_id is null or not exists (
    select 1 from public.negotiations n
    where n.shipper_company_id = v_shipper and n.carrier_company_id = p_carrier_company_id
  ) then
    raise exception 'carrier not found' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'a status is required' using errcode = '22023';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;

  -- One decision at a time per pair: the row (created pending-less on the
  -- first decision) is locked before it is read.
  select * into v_current from public.provider_approvals
  where shipper_company_id = v_shipper and carrier_company_id = p_carrier_company_id
  for update;

  if found and v_current.status = p_status then
    return p_status;
  end if;
  if (p_status = 'revoked' and (not found or v_current.status <> 'approved'))
     or (p_status = 'rejected' and found and v_current.status = 'approved') then
    raise exception 'cannot change a provider from % to %', coalesce(v_current.status::text, 'pending'), p_status
      using errcode = '55000';
  end if;

  insert into public.provider_approvals as a (shipper_company_id, carrier_company_id, status, notes, decided_by, decided_at)
  values (v_shipper, p_carrier_company_id, p_status, v_notes, (select auth.uid()), now())
  on conflict (shipper_company_id, carrier_company_id) do update
    set status = excluded.status, notes = excluded.notes, decided_by = excluded.decided_by, decided_at = excluded.decided_at
    -- Two first decisions at once: the second one only wins if it is still a
    -- valid transition from the first.
    where not (excluded.status = 'revoked' and a.status <> 'approved')
      and not (excluded.status = 'rejected' and a.status = 'approved');
  if not found then
    raise exception 'the provider status changed meanwhile' using errcode = '40001';
  end if;

  insert into public.provider_approval_events (shipper_company_id, carrier_company_id, status, notes, decided_by)
  values (v_shipper, p_carrier_company_id, p_status, v_notes, (select auth.uid()));

  select x.business_unit_id, x.trip_id, x.negotiation_id, x.load_id into v_last
  from (
    select t.business_unit_id, t.id as trip_id, null::uuid as negotiation_id, t.load_id, t.created_at
    from public.trips t
    where t.shipper_company_id = v_shipper and t.carrier_company_id = p_carrier_company_id
    union all
    select n.business_unit_id, null, n.id, n.load_id, n.created_at
    from public.negotiations n
    where n.shipper_company_id = v_shipper and n.carrier_company_id = p_carrier_company_id
  ) x
  order by x.created_at desc, x.trip_id nulls last
  limit 1;

  perform public.notify_carrier_staff(
    p_carrier_company_id, v_last.business_unit_id, 'provider_status_changed',
    jsonb_strip_nulls(jsonb_build_object(
      'status', p_status,
      'shipperName', (select c.legal_name from public.companies c where c.id = v_shipper),
      'tripId', v_last.trip_id,
      'negotiationId', v_last.negotiation_id
    )) || public.load_route_data(v_last.load_id)
  );
  return p_status;
end;
$$;

revoke all on function public.set_provider_status(uuid, public.provider_status, text) from public, anon;
grant execute on function public.set_provider_status(uuid, public.provider_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- trip_document_added: a new trip document goes to the other side of the
-- trip (the shipper when the carrier uploads it; the carrier staff of the
-- trip's business unit when the shipper uploads the service order).
-- ---------------------------------------------------------------------------
create function public.notify_trip_document_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_data jsonb;
begin
  select * into v_trip from public.trips where id = new.trip_id;
  v_data := jsonb_build_object('tripId', v_trip.id, 'documentKind', new.kind) || public.load_route_data(v_trip.load_id);
  if exists (
    select 1 from public.profiles p
    where p.id = new.uploaded_by and p.role = 'shipper' and p.company_id = v_trip.shipper_company_id
  ) then
    perform public.notify_carrier_staff(v_trip.carrier_company_id, v_trip.business_unit_id, 'trip_document_added', v_data);
  else
    perform public.notify_company(v_trip.shipper_company_id, 'shipper', 'trip_document_added', v_data);
  end if;
  return null;
end;
$$;

revoke all on function public.notify_trip_document_added() from public, anon, authenticated;

create trigger trip_documents_notify_added
after insert on public.trip_documents
for each row execute function public.notify_trip_document_added();

-- ---------------------------------------------------------------------------
-- Rate limits: same as 20261025120000_incident_photos_clock_rate_limits.sql,
-- plus the 'shared_document_url' bucket (G6): each call signs a URL of a
-- carrier's document and writes a view to the log.
-- ---------------------------------------------------------------------------
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
    -- G6: Edge Function shared-document-url, per user and minute.
    ('shared_document_url', 'user', 30, 60)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

revoke all on function public.rate_limit_policy(text) from public, anon, authenticated, service_role;
