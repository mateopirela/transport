-- B09 · Notification dispatch and crons.
--
--   * The queue of the dispatcher is public.notifications (B07). The Edge
--     Function `dispatch-notifications` claims pending rows with a lease
--     (claim_notifications), sends Expo Push and email, and reports back
--     (record_notification_dispatch). Each channel keeps its own sent mark, so
--     a retry never sends a channel twice; a claim is fenced by its attempt
--     number, so a late worker cannot overwrite a newer claim.
--   * pg_cron jobs: expire loads whose pickup window closed, warn about
--     documents that expire in 30 and 7 days and mark them `expired`, remind
--     the operator of an active trip that stopped sending its location, and
--     invoke the dispatcher every minute (only once its URL and secret are in
--     Vault; until then it does nothing).
--
-- Security model (same as B01-B08): every function here is `security definer`
-- with an empty search_path and is revoked from public, anon and
-- authenticated. The dispatcher RPCs are for the service role only; the cron
-- functions are run by pg_cron (as postgres) and are not exposed at all.
--
-- Lock order: expire_stale_loads locks loads, then their offers, like the
-- negotiation RPCs (B05), and skips rows another transaction holds.

create extension if not exists pg_net with schema extensions;

-- Reminder to the operator of an active trip without recent location. Only
-- used by functions below (never in a statement of this migration), so the new
-- label can be added in the same transaction.
alter type public.notification_type add value if not exists 'trip_location_stale';

-- ---------------------------------------------------------------------------
-- Dispatch state of each notification
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column push_sent_at timestamptz,
  add column email_sent_at timestamptz,
  add column dispatch_attempts smallint not null default 0
    constraint notifications_dispatch_attempts_range check (dispatch_attempts >= 0),
  -- Not before: the lease of the current claim, or the backoff of a retry.
  add column dispatch_retry_at timestamptz,
  add column dispatch_error text
    constraint notifications_dispatch_error_length check (char_length(dispatch_error) <= 1000);

comment on column public.notifications.dispatched_at is
  'Set when the dispatcher (B09) finished with the notification: sent, not applicable, stale or given up.';

-- ---------------------------------------------------------------------------
-- RPC (service role): claim up to p_limit pending notifications for
-- p_lease_seconds. Notifications older than a day are not pushed any more
-- (they stay in the inbox): they are closed as `stale` instead.
-- ---------------------------------------------------------------------------
create function public.claim_notifications(p_limit integer default 100, p_lease_seconds integer default 120)
returns table (
  id uuid,
  user_id uuid,
  type public.notification_type,
  data jsonb,
  created_at timestamptz,
  attempt integer,
  push_pending boolean,
  email_pending boolean,
  email text,
  role public.user_role,
  push_tokens text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 10 and 3600 then
    raise exception 'lease must be between 10 and 3600 seconds' using errcode = '22023';
  end if;

  return query
  with due as (
    select n.id, n.created_at < now() - interval '1 day' as stale
    from public.notifications n
    where n.dispatched_at is null
      and (n.dispatch_retry_at is null or n.dispatch_retry_at <= now())
    order by n.created_at, n.id
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.notifications n
    set dispatch_attempts = case when d.stale then n.dispatch_attempts else n.dispatch_attempts + 1 end,
        dispatch_retry_at = case when d.stale then null else now() + make_interval(secs => p_lease_seconds) end,
        dispatched_at = case when d.stale then now() end,
        dispatch_error = case when d.stale then 'stale' else n.dispatch_error end
    from due d
    where n.id = d.id
    returning n.*, d.stale
  )
  select c.id, c.user_id, c.type, c.data, c.created_at, c.dispatch_attempts::integer,
         c.push_sent_at is null, c.email_sent_at is null,
         u.email::text, p.role,
         coalesce(
           (select array_agg(t.token order by t.last_seen_at desc, t.id) from public.push_tokens t where t.user_id = c.user_id),
           '{}'
         )
  from claimed c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  where not c.stale
  order by c.created_at, c.id;
end;
$$;

revoke all on function public.claim_notifications(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- RPC (service role): results of a dispatch, as an array of
--   { id, attempt, pushSent, emailSent, done, error }
-- `done` closes the notification; otherwise it is retried with backoff
-- (1, 4, 16, 64 minutes) and given up after 5 attempts. A result whose attempt
-- is not the current claim is ignored. Returns the number of rows updated.
-- ---------------------------------------------------------------------------
create function public.record_notification_dispatch(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 500 then
    raise exception 'results must be an array of at most 500 items' using errcode = '22023';
  end if;

  with r as (
    select distinct on ((x ->> 'id')::uuid)
           (x ->> 'id')::uuid as id,
           (x ->> 'attempt')::integer as attempt,
           coalesce((x ->> 'pushSent')::boolean, false) as push_sent,
           coalesce((x ->> 'emailSent')::boolean, false) as email_sent,
           coalesce((x ->> 'done')::boolean, false) as done,
           left(nullif(btrim(x ->> 'error'), ''), 1000) as error
    from jsonb_array_elements(p_results) x
    order by (x ->> 'id')::uuid
  )
  update public.notifications n
  set push_sent_at = case when r.push_sent then coalesce(n.push_sent_at, now()) else n.push_sent_at end,
      email_sent_at = case when r.email_sent then coalesce(n.email_sent_at, now()) else n.email_sent_at end,
      dispatched_at = case when r.done or n.dispatch_attempts >= 5 then now() end,
      dispatch_retry_at = case
        when r.done or n.dispatch_attempts >= 5 then null
        else now() + make_interval(mins => power(4, n.dispatch_attempts - 1)::integer)
      end,
      dispatch_error = r.error
  from r
  where n.id = r.id
    and n.dispatched_at is null
    and n.dispatch_attempts = r.attempt;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_notification_dispatch(jsonb) from public, anon, authenticated;
grant execute on function public.record_notification_dispatch(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- RPC (service role): forget push tokens that Expo reports as invalid.
-- ---------------------------------------------------------------------------
create function public.delete_push_tokens(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if cardinality(p_tokens) > 1000 then
    raise exception 'at most 1000 tokens' using errcode = '22023';
  end if;
  delete from public.push_tokens where token = any (p_tokens);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.delete_push_tokens(text[]) from public, anon, authenticated;
grant execute on function public.delete_push_tokens(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Cron: expire published or negotiating loads whose pickup window closed. Their
-- pending offers expire with them (state machines of packages/shared).
-- ---------------------------------------------------------------------------
create function public.expire_stale_loads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(l.id), '{}') into v_ids
  from (
    select id from public.loads
    where status in ('published', 'negotiating') and pickup_window_end <= now()
    order by id
    for update skip locked
  ) l;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  update public.offers
  set status = 'expired', status_reason = 'load_expired', responded_at = now()
  where load_id = any (v_ids) and status = 'pending';

  update public.loads set status = 'expired' where id = any (v_ids);
  return cardinality(v_ids);
end;
$$;

revoke all on function public.expire_stale_loads() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- document_expiry_notices: which expiry warnings were already sent, per
-- document, threshold and expiry date (a new expiry date warns again). Only
-- process_document_expiry writes it; no client can read or write it.
-- ---------------------------------------------------------------------------
create table public.document_expiry_notices (
  document_id uuid not null references public.documents (id) on delete cascade,
  threshold_days smallint not null constraint document_expiry_notices_threshold_range
    check (threshold_days between 1 and 365),
  expires_at timestamptz not null,
  notified_at timestamptz not null default now(),
  primary key (document_id, threshold_days, expires_at)
);

comment on table public.document_expiry_notices is
  'Expiry warnings already sent (B09 cron). Written only by process_document_expiry.';

revoke all on table public.document_expiry_notices from public, anon, authenticated;
alter table public.document_expiry_notices enable row level security;

-- ---------------------------------------------------------------------------
-- Cron: mark expired documents and warn (once per threshold) about the ones
-- that expire within p_thresholds days. A document that enters several
-- thresholds at once gets a single notification. Recipients: the members of
-- the owner company that manage documents and, for an operator document, the
-- operator. Returns the number of documents warned.
-- ---------------------------------------------------------------------------
create function public.process_document_expiry(p_thresholds integer[] default '{30,7}')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc record;
  v_ids uuid[];
  v_count integer := 0;
  v_data jsonb;
begin
  if cardinality(p_thresholds) is distinct from (
    select count(*) from unnest(p_thresholds) t where t between 1 and 365
  ) or cardinality(p_thresholds) = 0 then
    raise exception 'thresholds must be between 1 and 365 days' using errcode = '22023';
  end if;

  update public.documents
  set status = 'expired'
  where status = 'approved' and archived_at is null and expires_at <= now();

  with due as (
    insert into public.document_expiry_notices (document_id, threshold_days, expires_at)
    select d.id, t, d.expires_at
    from public.documents d
    cross join unnest(p_thresholds) t
    where d.status = 'approved'
      and d.archived_at is null
      and d.expires_at > now()
      and d.expires_at <= now() + make_interval(days => t)
    on conflict do nothing
    returning document_id
  )
  select coalesce(array_agg(distinct document_id), '{}') into v_ids from due;

  for v_doc in
    select d.id, d.company_id, d.owner_type, d.owner_id, d.expires_at, c.type as company_type,
           r.name as requirement_name,
           (d.expires_at at time zone 'America/Mexico_City')::date
             - (now() at time zone 'America/Mexico_City')::date as days_left,
           case d.owner_type
             when 'vehicle' then (select v.plate from public.vehicles v where v.id = d.owner_id)
             when 'operator' then (select o.full_name from public.operators o where o.id = d.owner_id)
           end as owner_label,
           (select o.profile_id from public.operators o
            where d.owner_type = 'operator' and o.id = d.owner_id) as operator_profile_id
    from public.documents d
    join public.companies c on c.id = d.company_id
    join public.document_requirements r on r.id = d.requirement_id
    where d.id = any (v_ids)
    order by d.id
  loop
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'documentId', v_doc.id,
      'ownerType', v_doc.owner_type,
      'ownerId', v_doc.owner_id,
      'ownerLabel', v_doc.owner_label,
      'requirementName', v_doc.requirement_name,
      'expiresAt', v_doc.expires_at,
      'daysLeft', greatest(v_doc.days_left, 0)
    ));
    perform public.notify_company(
      v_doc.company_id, v_doc.company_type::text::public.user_role, 'document_expiring', v_data
    );
    -- The operator, unless they are also a carrier of the company (D13) and
    -- already got it.
    insert into public.notifications (user_id, type, data)
    select v_doc.operator_profile_id, 'document_expiring', v_data
    where v_doc.operator_profile_id is not null
      and not exists (
        select 1 from public.profiles p
        where p.id = v_doc.operator_profile_id and p.company_id = v_doc.company_id
          and p.role::text = v_doc.company_type::text
      );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.process_document_expiry(integer[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cron: remind the operator of an active trip whose last location (or its
-- start, if it never sent one) is older than p_stale_after. One reminder per
-- gap: a new point is needed before the next one. Returns the reminders sent.
-- ---------------------------------------------------------------------------
create function public.remind_stale_trip_locations(p_stale_after interval default interval '3 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_stale_after is null or p_stale_after < interval '15 minutes' or p_stale_after > interval '2 days' then
    raise exception 'stale_after must be between 15 minutes and 2 days' using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, data)
  select s.profile_id, 'trip_location_stale',
         jsonb_build_object(
           'tripId', s.trip_id,
           'lastLocationAt', s.last_at,
           'hoursWithoutLocation', floor(extract(epoch from now() - s.since) / 3600)::integer
         ) || public.load_route_data(s.load_id)
  from (
    select t.id as trip_id, t.load_id, o.profile_id, l.last_at,
           coalesce(l.last_at, t.started_at, t.assigned_at) as since
    from public.trips t
    join public.operators o on o.id = t.operator_id and o.company_id = t.carrier_company_id
    cross join lateral (
      select max(tl.recorded_at) as last_at
      from public.trip_locations tl
      where tl.trip_id = t.id
    ) l
    where public.trip_is_active(t.status)
      and o.profile_id is not null
  ) s
  where s.since <= now() - p_stale_after
    and not exists (
      select 1 from public.notifications n
      where n.user_id = s.profile_id
        and n.type = 'trip_location_stale'
        and n.data ->> 'tripId' = s.trip_id::text
        and n.created_at > s.since
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.remind_stale_trip_locations(interval) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cron: invoke the Edge Function when something is due. Needs two Vault
-- secrets (see docs/demo-local.md, "Notificaciones"): `notifications_dispatch_url` and
-- `notifications_dispatch_secret`. Without them it does nothing.
-- ---------------------------------------------------------------------------
create function public.invoke_notification_dispatcher()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notifications_dispatch_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  if not exists (
    select 1 from public.notifications n
    where n.dispatched_at is null and (n.dispatch_retry_at is null or n.dispatch_retry_at <= now())
  ) then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.invoke_notification_dispatcher() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schedules (UTC; Mexico City is UTC-6 all year). cron.schedule replaces a job
-- with the same name, so re-running this file is harmless.
-- ---------------------------------------------------------------------------
select cron.schedule('dispatch-notifications', '* * * * *', 'select public.invoke_notification_dispatcher()');
select cron.schedule('expire-stale-loads', '*/15 * * * *', 'select public.expire_stale_loads()');
-- 07:00 in Mexico City, so warnings do not arrive at night.
select cron.schedule('process-document-expiry', '0 13 * * *', 'select public.process_document_expiry()');
select cron.schedule('remind-stale-trip-locations', '*/10 * * * *', 'select public.remind_stale_trip_locations()');
