-- R3 · Alta por pasos: documentos, paso por perfil y verificación (D42–D44,
-- D47, D16-E3).
--
-- What changes:
--   * Catalog (data, D12; no row is deleted):
--       - power_of_attorney, "Poder o documento de representación": a company
--         document for shippers and carriers, optional (is_required = false):
--         it applies when whoever registers acts on behalf of the holder or
--         the company, and the admin may ask for it when reviewing (D16-E3).
--       - operator_selfie, "Selfie" (D44): an operator document, required,
--         private (shareable_with_shipper = false, D21), without expiry. The
--         admin reviews it by hand next to the official id: no face
--         recognition. R4's operator_missing_requirements reads the catalog,
--         so the trip gate (D45) asks for it without code changes.
--       - legal_representative_id becomes "INE del titular o representante
--         legal" and is no longer optional for shippers (optional_for = '{}',
--         D16-E3). Approved companies stay approved: review_company only
--         reads the catalog when approving, so the new documents show up as
--         pending to upload.
--   * The operator uploads their own documents (step 4 of their profile,
--     D42): submit_document, the `documents` table and the Storage policies
--     of the `documents` bucket let an operator write and read only the
--     documents with owner_type = 'operator' of their own active operator
--     row (auth_operator_id()), under their company's folder. Nothing of the
--     company, the units or other operators. An operator's upload never moves
--     a rejected company back to review (that stays with the company staff).

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
insert into public.document_requirements
  (code, owner_type, company_type, taxpayer_type, name, description, is_required, requires_expiry,
   sort_order, shareable_with_shipper)
values
  ('power_of_attorney', 'company', null, null,
   'Poder o documento de representación',
   'Si registras la cuenta en nombre del titular o de la empresa. Podemos pedírtelo al revisar.',
   false, false, 35, false),
  ('operator_selfie', 'operator', 'carrier', null,
   'Selfie',
   'Una foto de tu cara tomada con la cámara frontal. Solo la ve el equipo que revisa tus documentos.',
   true, false, 95, false)
on conflict (code) do nothing;

update public.document_requirements
set name = 'INE del titular o representante legal',
    description = 'INE o pasaporte vigente de quien firma por la persona o la empresa.',
    optional_for = '{}'
where code = 'legal_representative_id';

-- ---------------------------------------------------------------------------
-- RPC: submit_document
-- ---------------------------------------------------------------------------

-- Same as G1a.1 (20261026020200_business_unit_rpcs.sql), except an operator
-- submits the documents of their own operator row (R3) and an operator's
-- upload does not send a rejected company back to review.
create or replace function public.submit_document(p_requirement_id uuid, p_owner_type public.document_owner_type, p_owner_id uuid, p_storage_path text, p_file_name text default null, p_expires_at timestamptz default null)
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
  if v_role is null or v_role not in ('shipper', 'manager', 'coordinator', 'operator') then
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
  -- A coordinator submits the documents of the units and operators they run,
  -- never the company's.
  if v_role = 'coordinator' and not public.coordinator_runs_document_owner(p_owner_type, p_owner_id) then
    raise exception 'owner does not belong to the caller company' using errcode = '42501';
  end if;
  -- An operator submits only the documents of their own active operator row
  -- (R3): never the company's, a unit's or another operator's. Same message,
  -- so the check reveals nothing about the owner.
  if v_role = 'operator'
     and (p_owner_type <> 'operator' or p_owner_id is distinct from public.auth_operator_id()) then
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

  -- A rejected company goes back to the review queue when its staff sends new
  -- documents; an operator's own documents do not decide that.
  if v_company.status = 'rejected' and v_role <> 'operator' then
    update public.companies set status = 'pending_review' where id = v_company.id;
  end if;

  return v_document_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: the operator reads their own operator documents
-- ---------------------------------------------------------------------------

-- Permissive, next to documents_select_own_company_or_admin (which gives an
-- operator nothing): only the rows of the caller's own active operator row,
-- in the caller's company.
create policy documents_select_own_operator
on public.documents
for select
to authenticated
using (
  owner_type = 'operator'
  and (select public.auth_role()) = 'operator'
  and owner_id = (select public.auth_operator_id())
  and company_id = (select public.auth_company_id())
);

-- ---------------------------------------------------------------------------
-- Storage: the operator's own folder in the `documents` bucket
-- ---------------------------------------------------------------------------

-- An operator uploads only under {company}/operator/{their operator row}/,
-- with the usual {uuid}[.ext] file name, while the row and the company are
-- active and the row is of that company. No update or delete policy: files
-- are never overwritten or removed by clients.
create policy documents_bucket_insert_own_operator
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (select public.auth_role()) = 'operator'
  and name ~ (
    '^' || (select public.auth_company_id())::text
    || '/operator/' || (select public.auth_operator_id())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$'
  )
  and exists (
    select 1
    from public.operators o
    join public.companies c on c.id = o.company_id
    where o.id = (select public.auth_operator_id())
      and o.company_id = (select public.auth_company_id())
      and o.archived_at is null
      and c.archived_at is null
  )
);

-- The operator reads the files of their own operator row only.
create policy documents_bucket_select_own_operator
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (select public.auth_role()) = 'operator'
  and split_part(name, '/', 1) = (select public.auth_company_id())::text
  and split_part(name, '/', 2) = 'operator'
  and split_part(name, '/', 3) = (select public.auth_operator_id())::text
);
