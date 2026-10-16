-- B22 · Background GPS of the operator: the recorded consent to share the
-- location during trips (producto-v1 §6: aviso de privacidad LFPDPPP con
-- consentimiento de ubicación registrado), and record_trip_locations now
-- refuses points from an operator without an active consent.
--
-- Security model (same as B01-B07):
--   * RLS on; `anon` gets nothing and `authenticated` only SELECT on its own
--     consents (admins read all of them, as evidence of the consent).
--   * Consents are written only by the RPCs below. A consent row is never
--     edited: the only change allowed is revoking it once (trigger).
--   * At most one active (not revoked) consent per user.

-- ---------------------------------------------------------------------------
-- location_consents
-- ---------------------------------------------------------------------------
create table public.location_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Version of the consent text the user accepted (LOCATION_CONSENT_VERSION
  -- in packages/shared): a new text asks for the consent again.
  policy_version text not null
    constraint location_consents_policy_version_format check (policy_version ~ '^\d{4}-\d{2}-\d{2}$'),
  platform text not null constraint location_consents_platform_check check (platform in ('ios', 'android')),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint location_consents_revoked_after_accepted check (revoked_at is null or revoked_at >= accepted_at)
);

comment on table public.location_consents is
  'Consent of an operator to share the location in the background during active trips (B22). Written only by RPCs.';

create unique index location_consents_one_active_idx on public.location_consents (user_id) where revoked_at is null;
create index location_consents_user_idx on public.location_consents (user_id, accepted_at desc);

-- A consent is evidence: nothing changes except revoking it, once.
create function public.location_consents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null
     or new.revoked_at is null
     or (new.id, new.user_id, new.policy_version, new.platform, new.accepted_at)
        is distinct from (old.id, old.user_id, old.policy_version, old.platform, old.accepted_at) then
    raise exception 'a location consent can only be revoked' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.location_consents_guard() from public, anon, authenticated;

create trigger location_consents_guard
before update on public.location_consents
for each row execute function public.location_consents_guard();

revoke all on table public.location_consents from public, anon, authenticated;
grant select on table public.location_consents to authenticated;

alter table public.location_consents enable row level security;

-- Own consents, and admins (evidence). No insert/update/delete policies:
-- writes go through the RPCs below.
create policy location_consents_select
on public.location_consents
for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Helper: whether the caller has an active consent.
-- ---------------------------------------------------------------------------
create function public.has_location_consent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.location_consents c
    where c.user_id = (select auth.uid()) and c.revoked_at is null
  );
$$;

revoke all on function public.has_location_consent() from public, anon;
grant execute on function public.has_location_consent() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: an operator accepts the consent text `p_policy_version` on the device
-- platform. Idempotent: accepting the same version again returns the active
-- consent; a new version replaces (revokes) the previous one.
-- ---------------------------------------------------------------------------
create function public.record_location_consent(p_policy_version text, p_platform text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_active public.location_consents;
  v_id uuid;
begin
  -- Only operators share their location (the app asks nobody else).
  if v_user is null or public.auth_operator_id() is null then
    raise exception 'only operators give location consent' using errcode = '42501';
  end if;
  if p_policy_version is null or p_policy_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid consent version' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;

  -- Serialize the consents of one user (two taps, two devices).
  perform 1 from public.profiles where id = v_user for update;

  select * into v_active from public.location_consents
  where user_id = v_user and revoked_at is null;
  if found and v_active.policy_version = p_policy_version and v_active.platform = p_platform then
    return v_active.id;
  end if;
  if found then
    update public.location_consents set revoked_at = now() where id = v_active.id;
  end if;

  insert into public.location_consents (user_id, policy_version, platform)
  values (v_user, p_policy_version, p_platform)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_location_consent(text, text) from public, anon;
grant execute on function public.record_location_consent(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the caller withdraws the consent. From then on no location point of
-- theirs is accepted. Returns how many consents were revoked (0 or 1).
-- ---------------------------------------------------------------------------
create function public.revoke_location_consent()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = v_user for update;
  update public.location_consents set revoked_at = now()
  where user_id = v_user and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.revoke_location_consent() from public, anon;
grant execute on function public.revoke_location_consent() to authenticated;

-- ---------------------------------------------------------------------------
-- record_trip_locations (B06) now also requires the operator's consent. Same
-- body otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.record_trip_locations(p_trip_id uuid, p_points jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_count integer;
begin
  -- Authorize, then share-lock: concurrent batches of the same trip do not
  -- block each other, but they wait for (and see) a delivery being recorded.
  if public.auth_operator_id() is null or not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.operator_id = public.auth_operator_id()
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  -- B22: no point is stored without the operator's consent (privacy). The
  -- key-share lock on the profile conflicts with the FOR UPDATE lock taken by
  -- revoke_location_consent and is held until commit: a withdrawal either
  -- waits for this batch, or commits first and this check sees it. Batches do
  -- not block each other, nor ordinary profile updates.
  perform 1 from public.profiles where id = (select auth.uid()) for key share;
  if not public.has_location_consent() then
    raise exception 'location consent required' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for share;
  if v_trip.operator_id is distinct from public.auth_operator_id() then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  if not (public.trip_is_active(v_trip.status) or v_trip.status = 'delivered') then
    raise exception 'trip is not active (status %)', v_trip.status using errcode = '55000';
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points) > 500 then
    raise exception 'points must be an array of at most 500 items' using errcode = '22023';
  end if;

  begin
    insert into public.trip_locations (trip_id, recorded_at, latitude, longitude, accuracy_m, speed_mps, heading_deg)
    select v_trip.id, p.recorded_at, p.lat, p.lng, p.accuracy_m, p.speed_mps, p.heading_deg
    from (
      select distinct on ((x ->> 'recordedAt')::timestamptz)
        (x ->> 'recordedAt')::timestamptz as recorded_at,
        (x ->> 'lat')::double precision as lat,
        (x ->> 'lng')::double precision as lng,
        (x ->> 'accuracyM')::real as accuracy_m,
        (x ->> 'speedMps')::real as speed_mps,
        (x ->> 'headingDeg')::real as heading_deg
      from jsonb_array_elements(p_points) x
    ) p
    where p.recorded_at >= v_trip.started_at
      and p.recorded_at <= coalesce(v_trip.delivered_at, clock_timestamp() + interval '5 minutes')
    on conflict (trip_id, recorded_at) do nothing;
    get diagnostics v_count = row_count;
  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
         or numeric_value_out_of_range or not_null_violation or check_violation then
      raise exception 'invalid location point: %', sqlerrm using errcode = '22023';
  end;

  return v_count;
end;
$$;
