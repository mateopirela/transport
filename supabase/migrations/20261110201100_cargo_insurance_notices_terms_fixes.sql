-- I1 (corrections) · Cargo insurance notices, accepted terms and trip
-- documents (D35-E1, D22).
--
--   * cargo_insurance_missing: an offer accepted less than 24 hours before
--     the pickup already told the shipper; remind_cargo_insurance no longer
--     repeats it minutes later (it still warns the carrier staff).
--   * Accepted terms: only the current version (current_terms_version, the
--     mirror of TERMS_VERSION in packages/shared/src/copy/legal.ts, compared
--     by a Vitest test) is kept, by accept_terms and at sign-up: no
--     impossible dates, no old versions, no future versions in advance.
--   * add_trip_document checks the side of the caller before its idempotency,
--     and only returns a document the caller uploaded: a carrier who sends the
--     storage path of the shipper's policy no longer gets its id.

-- ---------------------------------------------------------------------------
-- cargo_insurance_missing: one notice to the shipper
-- ---------------------------------------------------------------------------

-- The shipper's users, the one who accepted the offer included. With
-- p_since, a user already told about the trip since then is skipped.
-- Internal.
drop function public.notify_shipper_cargo_insurance(uuid);
create function public.notify_shipper_cargo_insurance(p_trip_id uuid, p_since timestamptz default null)
returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (user_id, type, data)
  select p.id, 'cargo_insurance_missing', public.cargo_insurance_notice_data(t, 'shipper')
  from public.trips t
  join public.profiles p on p.company_id = t.shipper_company_id and p.role = 'shipper'
  where t.id = p_trip_id
    and (p_since is null or not exists (
      select 1 from public.notifications n
      where n.user_id = p.id
        and n.type = 'cargo_insurance_missing'
        and n.created_at >= p_since
        and n.data ->> 'tripId' = t.id::text
        and n.data ->> 'audience' = 'shipper'
    ));
$$;

revoke all on function public.notify_shipper_cargo_insurance(uuid, timestamptz) from public, anon, authenticated, service_role;

-- Same as I1 (20261110000100_cargo_insurance_terms.sql), except the shipper
-- is not reminded when the notice of the acceptance already reached them in
-- the last 24 hours before the pickup (an offer accepted that close to it).
create or replace function public.remind_cargo_insurance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_pickup timestamptz;
  v_count integer := 0;
begin
  if not exists (select 1 from public.trip_document_requirements r where r.kind = 'cargo_insurance' and r.is_required) then
    return 0;
  end if;

  for v_trip in
    select t.*
    from public.trips t
    join public.loads l on l.id = t.load_id
    where t.status in ('pending_assignment', 'assigned')
      and l.pickup_window_start > now()
      and l.pickup_window_start <= now() + interval '24 hours'
      and not exists (select 1 from public.cargo_insurance_reminders cr where cr.trip_id = t.id)
      and not public.trip_cargo_insured(t.id)
    order by t.id
  loop
    insert into public.cargo_insurance_reminders (trip_id) values (v_trip.id) on conflict do nothing;
    if found then
      select l.pickup_window_start into v_pickup from public.loads l where l.id = v_trip.load_id;
      perform public.notify_shipper_cargo_insurance(v_trip.id, v_pickup - interval '24 hours');
      perform public.notify_carrier_staff(
        v_trip.carrier_company_id, v_trip.business_unit_id, 'cargo_insurance_missing',
        public.cargo_insurance_notice_data(v_trip, 'carrier')
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.remind_cargo_insurance() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accepted terms: the current version only
-- ---------------------------------------------------------------------------

-- The version of the terms every account accepts. Mirror of TERMS_VERSION
-- (packages/shared/src/copy/legal.ts): bump both together, in a new
-- migration that replaces this function (the Vitest test
-- e2e/support/terms-version.test.ts compares the latest definition with the
-- constant).
create function public.current_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-11-10'::text $$;

revoke all on function public.current_terms_version() from public, anon;
grant execute on function public.current_terms_version() to authenticated, service_role;

comment on column public.terms_acceptances.ip is
  'The address the web server saw the acceptance come from (x-forwarded-for of the person''s request), sent by the caller of accept_terms; null from the app and at sign-up. Informational, not proof: the database cannot see the person''s address (the web calls it from the server).';

-- Same as I1, except only the current version is accepted.
--
-- The IP stays a parameter rather than being read from request.headers: the
-- web accepts from a server action, so the request PostgREST sees comes from
-- the web server (its x-forwarded-for would be the server's address, the same
-- for everyone), and the first entry of x-forwarded-for is whatever the
-- client sends anyway. The address is informational (see the column).
create or replace function public.accept_terms(p_terms_version text, p_ip inet default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_at timestamptz;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_terms_version is distinct from public.current_terms_version() then
    raise exception 'invalid terms version' using errcode = '22023';
  end if;
  insert into public.terms_acceptances (user_id, terms_version, ip)
  values (v_uid, p_terms_version, p_ip)
  on conflict (user_id, terms_version) do nothing;
  select a.accepted_at into v_at from public.terms_acceptances a
  where a.user_id = v_uid and a.terms_version = p_terms_version;
  return v_at;
end;
$$;

revoke all on function public.accept_terms(text, inet) from public, anon;
grant execute on function public.accept_terms(text, inet) to authenticated;

-- Same as I1, except a version other than the current one is ignored (the
-- apps then ask for the acceptance at the first sign-in).
create or replace function public.record_sign_up_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := new.raw_user_meta_data ->> 'terms_version';
begin
  if v_version = public.current_terms_version() and exists (select 1 from public.profiles p where p.id = new.id) then
    insert into public.terms_acceptances (user_id, terms_version, accepted_at)
    values (new.id, v_version, coalesce(new.created_at, now()))
    on conflict (user_id, terms_version) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_sign_up_terms_acceptance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- add_trip_document: the side first, then the idempotency
-- ---------------------------------------------------------------------------

-- Same as G3 (20261027010200_trip_document_requirements.sql), except the kind
-- and the side are checked before the idempotency, which only returns a
-- document the caller uploaded: anything else goes on to the checks of the
-- file (uploaded by the caller), so nobody learns the id of a document of
-- another side. Same signature.
create or replace function public.add_trip_document(p_trip_id uuid, p_kind public.trip_document_kind, p_storage_path text, p_file_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_shipper uuid := public.auth_shipper_company_id();
  v_carrier uuid := public.auth_carrier_company_id();
  v_side public.offer_side;
  v_trip public.trips;
  v_object storage.objects%rowtype;
  v_name text := nullif(btrim(p_file_name), '');
  v_id uuid;
begin
  -- Authorize before locking: other companies' trips are never locked.
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (
        (v_shipper is not null and t.shipper_company_id = v_shipper)
        or (v_carrier is not null and t.carrier_company_id = v_carrier and public.can_operate_unit(t.business_unit_id))
      )
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the manager may have moved it meanwhile. The
  -- shipper comparison is null for carrier staff and the other way round, so
  -- the whole test is coalesced: a null must refuse, never pass.
  if not found or not coalesce(
    v_trip.shipper_company_id = v_shipper
    or (v_trip.carrier_company_id = v_carrier and public.can_operate_unit(v_trip.business_unit_id)),
    false
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  v_side := case when v_shipper is not null and v_trip.shipper_company_id = v_shipper then 'shipper' else 'carrier' end;

  if p_kind is null then
    raise exception 'a document kind is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.trip_document_requirements r
    where r.kind = p_kind and v_side = any (r.uploader_sides)
  ) then
    raise exception 'the % side does not upload % documents', v_side, p_kind using errcode = '42501';
  end if;

  -- A retry of the caller's own upload (also once the trip is cancelled).
  select d.id into v_id from public.trip_documents d
  where d.trip_id = v_trip.id and d.storage_path = p_storage_path and d.uploaded_by = v_uid;
  if found then
    return v_id;
  end if;

  if v_trip.status = 'cancelled' then
    raise exception 'trip is cancelled' using errcode = '55000';
  end if;
  if p_storage_path is null or p_storage_path !~ (
    '^' || v_trip.id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$'
  ) then
    raise exception 'invalid storage path' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) > 255 then
    raise exception 'a file name of at most 255 characters is required' using errcode = '22023';
  end if;

  -- The file must exist and have been uploaded by the caller.
  select * into v_object from storage.objects o
  where o.bucket_id = 'trip-documents' and o.name = p_storage_path and o.owner_id = v_uid::text;
  if not found then
    raise exception 'file was not uploaded' using errcode = '22023';
  end if;

  insert into public.trip_documents (trip_id, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (v_trip.id, p_kind, p_storage_path, v_name, v_object.metadata ->> 'mimetype',
          (v_object.metadata ->> 'size')::bigint, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
