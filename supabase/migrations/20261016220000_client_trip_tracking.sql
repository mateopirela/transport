-- B15 · Shipper trip tracking: trip documents (Carta Porte, D09) and the
-- shipper's narrow view of who carries its trip.
--
--   * trip_documents: files of a trip (Carta Porte and others) in the private
--     `trip-documents` bucket at {trip_id}/{uuid}.{ext}. D09: they are only
--     stored, never issued or validated. The carrier of the trip uploads them
--     (the mobile screen is B20) and registers them with add_trip_document;
--     every party of the trip reads them. No client writes otherwise.
--   * shipper_trip_parties(trips): carrier name and status, assigned unit
--     (type and plate) and operator name of the caller's trips. The shipper
--     cannot read companies, vehicles or operators of a carrier (RLS), and
--     needs them to identify the unit at pickup.
--
-- Lock order (B06): trip row first. add_trip_document only locks the trip.

create type public.trip_document_kind as enum ('carta_porte', 'other');

-- ---------------------------------------------------------------------------
-- trip_documents
-- ---------------------------------------------------------------------------
create table public.trip_documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete restrict,
  kind public.trip_document_kind not null,
  storage_path text not null constraint trip_documents_storage_path_key unique,
  file_name text not null constraint trip_documents_file_name_length check (char_length(file_name) between 1 and 255),
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.trip_documents is
  'Documents of a trip (Carta Porte, D09: stored only). Written only by add_trip_document.';

create index trip_documents_trip_idx on public.trip_documents (trip_id, created_at);

-- Stored documents are kept as uploaded (B06 reject_mutation): no role
-- updates, deletes or truncates them.
create trigger trip_documents_immutable before update or delete on public.trip_documents
for each row execute function public.reject_mutation();
create trigger trip_documents_no_truncate before truncate on public.trip_documents
for each statement execute function public.reject_mutation();

-- Read-only for clients (column list keeps future columns opt-in).
revoke all on table public.trip_documents from anon, authenticated;
grant select (id, trip_id, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at)
  on table public.trip_documents to authenticated;

alter table public.trip_documents enable row level security;

-- Whoever sees the trip (the subquery is filtered by trips_select).
create policy trip_documents_select
on public.trip_documents
for select
to authenticated
using (exists (select 1 from public.trips t where t.id = trip_documents.trip_id));

-- ---------------------------------------------------------------------------
-- Storage: private bucket `trip-documents`, path {trip_id}/{uuid}.{ext}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-documents', 'trip-documents', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Only the carrier of the trip uploads, into its folder, unless the trip was
-- cancelled. No update or delete policy: files are never replaced.
create policy trip_documents_bucket_insert_carrier
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trip-documents'
  and objects.name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$'
  )
  and exists (
    select 1 from public.trips t
    where t.id::text = split_part(objects.name, '/', 1)
      and t.carrier_company_id = (select public.auth_fleet_company_id())
      and t.status <> 'cancelled'
  )
);

-- Same visibility as the trip (the subquery is filtered by trips_select).
create policy trip_documents_bucket_select_trip_parties
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trip-documents'
  and exists (select 1 from public.trips t where t.id::text = split_part(objects.name, '/', 1))
);

-- ---------------------------------------------------------------------------
-- RPC: the carrier registers a file it uploaded to `trip-documents`.
-- Idempotent on the storage path. Returns the document id.
-- ---------------------------------------------------------------------------
create function public.add_trip_document(
  p_trip_id uuid,
  p_kind public.trip_document_kind,
  p_storage_path text,
  p_file_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_company uuid := public.auth_fleet_company_id();
  v_trip public.trips;
  v_object storage.objects%rowtype;
  v_name text := nullif(btrim(p_file_name), '');
  v_id uuid;
begin
  -- Authorize before locking: other companies' trips are never locked.
  if v_company is null or not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.carrier_company_id = v_company
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;

  select d.id into v_id from public.trip_documents d where d.trip_id = v_trip.id and d.storage_path = p_storage_path;
  if found then
    return v_id;
  end if;

  if v_trip.status = 'cancelled' then
    raise exception 'trip is cancelled' using errcode = '55000';
  end if;
  if p_kind is null then
    raise exception 'a document kind is required' using errcode = '22023';
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

revoke all on function public.add_trip_document(uuid, public.trip_document_kind, text, text) from public, anon;
grant execute on function public.add_trip_document(uuid, public.trip_document_kind, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: who carries each of the caller's trips. Rows only for trips of the
-- caller's shipper company (or any trip, for admins); at most 100 ids.
-- ---------------------------------------------------------------------------
create function public.shipper_trip_parties(p_trip_ids uuid[])
returns table (
  trip_id uuid,
  carrier_legal_name text,
  carrier_status public.verification_status,
  unit_type public.unit_type,
  plate text,
  operator_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if cardinality(p_trip_ids) > 100 then
    raise exception 'at most 100 trips per call' using errcode = '22023';
  end if;
  return query
    select t.id, c.legal_name, c.status, v.unit_type, v.plate, o.full_name
    from public.trips t
    join public.companies c on c.id = t.carrier_company_id
    left join public.vehicles v on v.id = t.vehicle_id
    left join public.operators o on o.id = t.operator_id
    where t.id = any (p_trip_ids)
      and (t.shipper_company_id = public.auth_shipper_company_id() or public.is_admin())
    order by t.created_at desc, t.id;
end;
$$;

revoke all on function public.shipper_trip_parties(uuid[]) from public, anon;
grant execute on function public.shipper_trip_parties(uuid[]) to authenticated;
