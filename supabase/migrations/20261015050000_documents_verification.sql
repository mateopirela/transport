-- B03 · Verification and documents: requirement catalog, documents, private
-- Storage bucket, review RPCs and the admin audit log.
--
-- Security model (docs/plan-v1.md §1, CONTRIBUTING.md):
--   * Clients never write `documents` or `audit_log` directly: documents are
--     created by `submit_document` and change status only through
--     `review_document` (admin); companies change status only through
--     `review_company` (admin).
--   * Members of a shipper/carrier company see their company's documents;
--     operators and other companies see nothing; admins see everything.
--   * Storage objects live in the private `documents` bucket under
--     `{company_id}/{owner_type}/{owner_id}/{uuid}[.ext]` and the Storage
--     policies apply the same company check as the table policies.
--   * Every admin write on companies, documents and document_requirements is
--     recorded by trigger in the immutable `audit_log`.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.document_owner_type as enum ('company', 'vehicle', 'operator');

-- RFC length tells the taxpayer type: 12 characters = persona moral,
-- 13 = persona física. Some requirements (acta constitutiva) only apply to one.
create type public.taxpayer_type as enum ('moral', 'fisica');

-- ---------------------------------------------------------------------------
-- document_requirements: catalog of required documents, stored as data (D12)
-- ---------------------------------------------------------------------------
create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  code text not null
    constraint document_requirements_code_format check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  owner_type public.document_owner_type not null,
  -- null = applies to both shipper and carrier companies.
  company_type public.company_type,
  -- null = applies to both personas morales and físicas.
  taxpayer_type public.taxpayer_type,
  -- Display name and help text in Spanish (D02). Catalog data, not UI copy:
  -- the official list from JP replaces these rows without code changes (D16).
  name text not null
    constraint document_requirements_name_length check (char_length(btrim(name)) between 1 and 200),
  description text
    constraint document_requirements_description_length check (char_length(description) <= 1000),
  is_required boolean not null default true,
  requires_expiry boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Operators and vehicles only exist for carriers.
  constraint document_requirements_fleet_is_carrier
    check (owner_type = 'company' or (company_type is not null and company_type = 'carrier')),
  constraint document_requirements_taxpayer_for_company
    check (owner_type = 'company' or taxpayer_type is null)
);

comment on table public.document_requirements is
  'Catalog of required documents per owner (company, vehicle, operator). Provisional list until D16.';

create unique index document_requirements_code_key on public.document_requirements (code);

create trigger document_requirements_set_updated_at
before update on public.document_requirements
for each row execute function public.set_updated_at();

-- Provisional list (D16: JP replaces it later).
insert into public.document_requirements
  (code, owner_type, company_type, taxpayer_type, name, description, requires_expiry, sort_order)
values
  ('tax_status_certificate', 'company', null, null,
   'Constancia de situación fiscal', 'Emitida por el SAT, con antigüedad máxima de 3 meses.', false, 10),
  ('articles_of_incorporation', 'company', null, 'moral',
   'Acta constitutiva', 'Solo personas morales.', false, 20),
  ('legal_representative_id', 'company', null, null,
   'Identificación del representante legal', 'INE o pasaporte vigente.', true, 30),
  ('proof_of_address', 'company', null, null,
   'Comprobante de domicilio', 'Con antigüedad máxima de 3 meses.', false, 40),
  ('sct_permit', 'company', 'carrier', null,
   'Permiso SCT/SICT', 'Permiso de autotransporte federal de carga.', false, 50),
  ('carrier_insurance_policy', 'company', 'carrier', null,
   'Póliza de seguro', 'Responsabilidad civil del transportista.', true, 60),
  ('vehicle_registration_card', 'vehicle', 'carrier', null,
   'Tarjeta de circulación', null, true, 70),
  ('vehicle_insurance_policy', 'vehicle', 'carrier', null,
   'Póliza de seguro de la unidad', null, true, 80),
  ('federal_driver_license', 'operator', 'carrier', null,
   'Licencia federal de conductor', null, true, 90);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  -- Company that owns the document (directly or through its vehicle/operator).
  company_id uuid not null references public.companies (id) on delete restrict,
  requirement_id uuid not null references public.document_requirements (id) on delete restrict,
  -- Polymorphic owner: the company itself, one of its vehicles or operators.
  owner_type public.document_owner_type not null,
  owner_id uuid not null,
  -- Object name inside the `documents` bucket.
  storage_path text not null,
  file_name text
    constraint documents_file_name_length check (char_length(file_name) <= 255),
  mime_type text,
  size_bytes bigint,
  status public.verification_status not null default 'pending_review',
  -- Admin notes; mandatory when rejecting.
  review_notes text
    constraint documents_review_notes_length check (char_length(review_notes) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz,
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set when a newer submission supersedes this one.
  archived_at timestamptz,
  constraint documents_company_owner_matches
    check (owner_type <> 'company' or owner_id = company_id),
  constraint documents_rejection_has_notes
    check (status <> 'rejected' or coalesce(char_length(btrim(review_notes)), 0) > 0)
);

comment on table public.documents is
  'Uploaded documents. Created by submit_document; status changes only through review_document.';

create unique index documents_storage_path_key on public.documents (storage_path);
create index documents_company_id_idx on public.documents (company_id);
create index documents_owner_idx on public.documents (owner_type, owner_id, requirement_id)
  where archived_at is null;
create index documents_review_queue_idx on public.documents (created_at)
  where status = 'pending_review' and archived_at is null;

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log: immutable record of admin actions
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- No foreign key: the log must survive the deletion of the actor.
  actor_id uuid,
  action text not null constraint audit_log_action_check check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id uuid,
  -- Company the record belongs to, for filtering (null for catalog rows).
  company_id uuid,
  old_data jsonb,
  new_data jsonb
);

comment on table public.audit_log is 'Immutable log of admin actions, written only by triggers.';

create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_company_idx on public.audit_log (company_id, occurred_at desc);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);

create function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is immutable' using errcode = '42501';
end;
$$;

revoke all on function public.audit_log_immutable() from public, anon, authenticated;

create trigger audit_log_immutable
before update or delete on public.audit_log
for each row execute function public.audit_log_immutable();

create trigger audit_log_no_truncate
before truncate on public.audit_log
for each statement execute function public.audit_log_immutable();

-- Records the write when the caller (JWT) is an admin. Runs as definer because
-- clients have no privileges on audit_log.
create function public.audit_admin_action()
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
      else (v_row ->> 'company_id')::uuid
    end,
    v_old,
    v_new
  );
  return null;
end;
$$;

revoke all on function public.audit_admin_action() from public, anon, authenticated;

create trigger companies_audit_admin
after insert or update or delete on public.companies
for each row execute function public.audit_admin_action();

create trigger documents_audit_admin
after insert or update or delete on public.documents
for each row execute function public.audit_admin_action();

create trigger document_requirements_audit_admin
after insert or update or delete on public.document_requirements
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Company that owns a document owner. Vehicles and operators arrive with B04;
-- until their tables exist (and this function is extended) only company
-- documents can be submitted.
create function public.document_owner_company_id(
  p_owner_type public.document_owner_type,
  p_owner_id uuid
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_owner_type = 'company' then
    return (select c.id from public.companies c where c.id = p_owner_id);
  end if;
  raise exception 'documents for % owners are not supported yet', p_owner_type
    using errcode = '0A000';
end;
$$;

revoke all on function public.document_owner_company_id(public.document_owner_type, uuid)
  from public, anon, authenticated;

create function public.taxpayer_type_for_rfc(p_rfc text)
returns public.taxpayer_type
language sql
immutable
set search_path = ''
as $$
  select case when char_length(p_rfc) = 12 then 'moral' else 'fisica' end::public.taxpayer_type;
$$;

-- Active required company documents that the company does not have approved
-- and unexpired. Security invoker: callers only see what RLS lets them see
-- (a member, their own company; an admin, any).
create function public.company_missing_requirements(p_company_id uuid)
returns setof public.document_requirements
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.document_requirements r
  join public.companies c on c.id = p_company_id
  where r.owner_type = 'company'
    and r.is_required
    and r.archived_at is null
    and (r.company_type is null or r.company_type = c.type)
    and (
      r.taxpayer_type is null
      or r.taxpayer_type = public.taxpayer_type_for_rfc(c.rfc)
    )
    and not exists (
      select 1
      from public.documents d
      where d.requirement_id = r.id
        and d.owner_type = 'company'
        and d.owner_id = c.id
        and d.status = 'approved'
        and d.archived_at is null
        and (d.expires_at is null or d.expires_at > now())
    )
  order by r.sort_order, r.code;
$$;

revoke all on function public.company_missing_requirements(uuid) from public, anon;
grant execute on function public.company_missing_requirements(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: submit_document
-- The client first uploads the file to the `documents` bucket (Storage
-- policies check the path) and then registers it here.
-- ---------------------------------------------------------------------------
create function public.submit_document(
  p_requirement_id uuid,
  p_owner_type public.document_owner_type,
  p_owner_id uuid,
  p_storage_path text,
  p_file_name text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role := public.auth_role();
  v_company public.companies%rowtype;
  v_requirement public.document_requirements%rowtype;
  v_object storage.objects%rowtype;
  v_document_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('shipper', 'carrier') then
    raise exception 'only shipper or carrier members can submit documents' using errcode = '42501';
  end if;

  -- Lock the company so a concurrent review_company sees a consistent state.
  select * into v_company from public.companies
  where id = public.auth_company_id() and archived_at is null
  for update;
  if not found then
    raise exception 'caller has no active company' using errcode = '42501';
  end if;

  if public.document_owner_company_id(p_owner_type, p_owner_id) is distinct from v_company.id then
    raise exception 'owner does not belong to the caller company' using errcode = '42501';
  end if;

  select * into v_requirement from public.document_requirements
  where id = p_requirement_id and archived_at is null;
  if not found then
    raise exception 'unknown document requirement' using errcode = '22023';
  end if;
  if v_requirement.owner_type <> p_owner_type
     or (v_requirement.company_type is not null and v_requirement.company_type <> v_company.type) then
    raise exception 'requirement % does not apply to this owner', v_requirement.code using errcode = '22023';
  end if;
  if v_requirement.taxpayer_type is not null
     and v_requirement.taxpayer_type <> public.taxpayer_type_for_rfc(v_company.rfc) then
    raise exception 'requirement % does not apply to this taxpayer type', v_requirement.code using errcode = '22023';
  end if;
  if v_requirement.requires_expiry and p_expires_at is null then
    raise exception 'requirement % needs an expiry date', v_requirement.code using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'document is already expired' using errcode = '22023';
  end if;

  -- {company_id}/{owner_type}/{owner_id}/{uuid}[.ext]
  if p_storage_path is null or p_storage_path !~ (
    '^' || v_company.id::text || '/' || p_owner_type::text || '/' || p_owner_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$'
  ) then
    raise exception 'invalid storage path' using errcode = '22023';
  end if;

  select * into v_object from storage.objects
  where bucket_id = 'documents' and name = p_storage_path;
  if not found then
    raise exception 'file was not uploaded' using errcode = '22023';
  end if;

  -- A newer submission supersedes pending ones for the same requirement and owner.
  update public.documents
  set archived_at = now()
  where requirement_id = v_requirement.id
    and owner_type = p_owner_type
    and owner_id = p_owner_id
    and status = 'pending_review'
    and archived_at is null;

  insert into public.documents (
    company_id, requirement_id, owner_type, owner_id, storage_path, file_name,
    mime_type, size_bytes, expires_at, submitted_by
  )
  values (
    v_company.id, v_requirement.id, p_owner_type, p_owner_id, p_storage_path,
    nullif(left(btrim(p_file_name), 255), ''),
    v_object.metadata ->> 'mimetype',
    (v_object.metadata ->> 'size')::bigint,
    p_expires_at,
    v_uid
  )
  returning id into v_document_id;

  -- A rejected company goes back to the review queue when it sends new documents.
  if v_company.status = 'rejected' then
    update public.companies set status = 'pending_review' where id = v_company.id;
  end if;

  return v_document_id;
end;
$$;

revoke all on function public.submit_document(uuid, public.document_owner_type, uuid, text, text, timestamptz)
  from public, anon;
grant execute on function public.submit_document(uuid, public.document_owner_type, uuid, text, text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: review_document (admin only)
-- pending_review -> approved | rejected. Rejections need a reason.
-- ---------------------------------------------------------------------------
create function public.review_document(
  p_document_id uuid,
  p_decision text,
  p_notes text default null,
  p_expires_at timestamptz default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_requires_expiry boolean;
  v_notes text := nullif(btrim(p_notes), '');
  v_expires_at timestamptz;
  v_status public.verification_status;
begin
  if not public.is_admin() then
    raise exception 'only admins can review documents' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;

  select * into v_document from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'document not found' using errcode = '22023';
  end if;
  if v_document.status <> 'pending_review' or v_document.archived_at is not null then
    raise exception 'document is not pending review (status %)', v_document.status
      using errcode = '55000';
  end if;

  if p_decision = 'reject' then
    if v_notes is null then
      raise exception 'a rejection needs a reason' using errcode = '22023';
    end if;
    v_status := 'rejected';
    v_expires_at := v_document.expires_at;
  else
    select r.requires_expiry into v_requires_expiry
    from public.document_requirements r where r.id = v_document.requirement_id;
    -- The admin may set or correct the expiry date read from the document.
    v_expires_at := coalesce(p_expires_at, v_document.expires_at);
    if v_requires_expiry and v_expires_at is null then
      raise exception 'this document needs an expiry date' using errcode = '22023';
    end if;
    if v_expires_at is not null and v_expires_at <= now() then
      raise exception 'document is already expired' using errcode = '22023';
    end if;
    v_status := 'approved';

    -- The approved document replaces the previously approved one.
    update public.documents
    set archived_at = now()
    where requirement_id = v_document.requirement_id
      and owner_type = v_document.owner_type
      and owner_id = v_document.owner_id
      and id <> v_document.id
      and status = 'approved'
      and archived_at is null;
  end if;

  update public.documents
  set status = v_status,
      review_notes = v_notes,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      expires_at = v_expires_at
  where id = v_document.id;

  return v_status;
end;
$$;

revoke all on function public.review_document(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.review_document(uuid, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: review_company (admin only)
--   approve: pending_review | rejected | suspended -> approved, only when every
--            required company document is approved and unexpired.
--   reject:  pending_review -> rejected (reason required).
--   suspend: approved -> suspended (reason required).
-- ---------------------------------------------------------------------------
create function public.review_company(
  p_company_id uuid,
  p_decision text,
  p_notes text default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_notes text := nullif(btrim(p_notes), '');
  v_missing text;
  v_status public.verification_status;
begin
  if not public.is_admin() then
    raise exception 'only admins can review companies' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject', 'suspend') then
    raise exception 'decision must be approve, reject or suspend' using errcode = '22023';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;

  select * into v_company from public.companies
  where id = p_company_id and archived_at is null
  for update;
  if not found then
    raise exception 'company not found' using errcode = '22023';
  end if;

  if p_decision = 'approve' then
    if v_company.status not in ('pending_review', 'rejected', 'suspended') then
      raise exception 'cannot approve a company in status %', v_company.status using errcode = '55000';
    end if;
    select string_agg(m.code, ', ' order by m.sort_order, m.code) into v_missing
    from public.company_missing_requirements(v_company.id) m;
    if v_missing is not null then
      raise exception 'company is missing required documents: %', v_missing using errcode = '55000';
    end if;
    v_status := 'approved';
  elsif p_decision = 'reject' then
    if v_company.status <> 'pending_review' then
      raise exception 'cannot reject a company in status %', v_company.status using errcode = '55000';
    end if;
    if v_notes is null then
      raise exception 'a rejection needs a reason' using errcode = '22023';
    end if;
    v_status := 'rejected';
  else
    if v_company.status <> 'approved' then
      raise exception 'cannot suspend a company in status %', v_company.status using errcode = '55000';
    end if;
    if v_notes is null then
      raise exception 'a suspension needs a reason' using errcode = '22023';
    end if;
    v_status := 'suspended';
  end if;

  update public.companies
  set status = v_status,
      status_reason = v_notes
  where id = v_company.id;

  return v_status;
end;
$$;

revoke all on function public.review_company(uuid, text, text) from public, anon;
grant execute on function public.review_company(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on table public.document_requirements from anon, authenticated;
revoke all on table public.documents from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;

grant select on table public.document_requirements to authenticated;
grant insert (code, owner_type, company_type, taxpayer_type, name, description, is_required,
              requires_expiry, sort_order)
  on table public.document_requirements to authenticated;
grant update (name, description, is_required, requires_expiry, sort_order, archived_at)
  on table public.document_requirements to authenticated;

grant select on table public.documents to authenticated;
grant select on table public.audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.document_requirements enable row level security;
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;

-- document_requirements: every signed-in user reads the catalog; only admins
-- add or edit entries. No delete: entries are archived.
create policy document_requirements_select_authenticated
on public.document_requirements
for select
to authenticated
using ((select auth.uid()) is not null);

create policy document_requirements_insert_admin
on public.document_requirements
for insert
to authenticated
with check ((select public.is_admin()));

create policy document_requirements_update_admin
on public.document_requirements
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- documents: shipper/carrier members of the owning company, or admins.
-- Writes only through the RPCs above (no insert/update/delete privileges).
create policy documents_select_own_company_or_admin
on public.documents
for select
to authenticated
using (
  (
    company_id = (select public.auth_company_id())
    and (select public.auth_role()) in ('shipper', 'carrier')
  )
  or (select public.is_admin())
);

-- audit_log: admins only; written by triggers, never by clients.
create policy audit_log_select_admin
on public.audit_log
for select
to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket `documents`
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760, -- 10 MiB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Members of a shipper/carrier company upload under their own company folder,
-- with the path shape {company_id}/{owner_type}/{owner_id}/{uuid}[.ext]. For
-- company documents the owner is the company itself. No update or delete
-- policy: files are never overwritten or removed by clients.
create policy documents_bucket_insert_own_company
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (select public.auth_role()) in ('shipper', 'carrier')
  and name ~ (
    '^' || (select public.auth_company_id())::text
    || '/(company|vehicle|operator)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$'
  )
  and (
    split_part(name, '/', 2) <> 'company'
    or split_part(name, '/', 3) = (select public.auth_company_id())::text
  )
  and exists (
    select 1 from public.companies c
    where c.id = (select public.auth_company_id()) and c.archived_at is null
  )
);

-- Same visibility as public.documents: own company (shipper/carrier) or admin.
-- Admins need it to create signed URLs for the review viewer (B12).
create policy documents_bucket_select_own_company_or_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (
    (
      split_part(name, '/', 1) = (select public.auth_company_id())::text
      and (select public.auth_role()) in ('shipper', 'carrier')
    )
    or (select public.is_admin())
  )
);
