-- S1 · Base del acceso sin fricción (plan-acceso.md §S1; D42-E1, D15-E3, D50,
-- D51). Nothing here relaxes an RPC or a policy.
--
-- What changes:
--   * review_company notifies the staff of the company when the admin
--     approves or rejects it (D51), with the reason of a rejection.
--   * register_company answers a repeated RFC with a stable error (D50-5).
--   * invitations.invitee_phone (D50-2): the optional phone of an invited
--     operator. create_invitation takes it (normalize_mx_phone) and
--     invitation_preview returns it, to whoever holds the token only (as the
--     name already is).
--
-- What does not: the INE of the hombre-camión (D50-4) is still uploaded
-- twice. A file belongs to one document (documents_storage_path_key) and its
-- path names its owner (company/owner_type/owner_id/file, which
-- submit_document and the Storage policies of the operator's own folder
-- check), so using the company's file as the operator's official id would
-- need either to drop both invariants or a privileged copy in Storage.

-- ---------------------------------------------------------------------------
-- D51 · review_company notifies the company
-- ---------------------------------------------------------------------------

-- Same as 20261028000000_registration.sql, except an approval or a rejection
-- leaves a notification (company_approved / company_rejected) to the
-- shipper, managers and coordinators of the company.
create or replace function public.review_company(
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
  v_missing_fields text[];
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
    v_missing_fields := public.company_missing_fields(v_company.id);
    if cardinality(v_missing_fields) > 0 then
      raise exception 'company is missing fiscal data: %', array_to_string(v_missing_fields, ', ')
        using errcode = '55000';
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

  -- D51: the people who run the company learn of the decision (the inbox,
  -- and the push or email that goes with every notification). The operators
  -- do not: the review of the company is not theirs to act on. A suspension
  -- has no notice: the admin contacts the company.
  if v_status in ('approved', 'rejected') then
    insert into public.notifications (user_id, type, data)
    select p.id,
           case v_status when 'approved' then 'company_approved' else 'company_rejected' end::public.notification_type,
           jsonb_strip_nulls(jsonb_build_object(
             'companyId', v_company.id,
             'companyName', v_company.legal_name,
             'reason', case when v_status = 'rejected' then v_notes end
           ))
    from public.profiles p
    where p.company_id = v_company.id
      and p.role in ('shipper', 'manager', 'coordinator')
      and p.id is distinct from (select auth.uid());
  end if;

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- D50-5 · register_company: a stable error for a repeated RFC
-- ---------------------------------------------------------------------------

-- Same as 20261028000000_registration.sql, except a repeated RFC raises
-- 23505 with the detail `rfc_taken` (instead of the bare unique violation of
-- companies_rfc_key). Only a signed-in account without a company gets here,
-- as before: nothing about an RFC is revealed without a session.
create or replace function public.register_company(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_kind text := p_payload ->> 'kind';
  v_legal_name text := nullif(btrim(p_payload ->> 'legalName'), '');
  v_rfc text := upper(regexp_replace(coalesce(p_payload ->> 'rfc', ''), '[\s-]', '', 'g'));
  v_street text := nullif(btrim(p_payload ->> 'fiscalStreet'), '');
  v_exterior text := nullif(btrim(p_payload ->> 'fiscalExteriorNumber'), '');
  v_interior text := nullif(btrim(p_payload ->> 'fiscalInteriorNumber'), '');
  v_neighborhood text := nullif(btrim(p_payload ->> 'fiscalNeighborhood'), '');
  v_postal_code text := nullif(btrim(p_payload ->> 'fiscalPostalCode'), '');
  v_municipality text := nullif(btrim(p_payload ->> 'fiscalMunicipality'), '');
  v_state text := nullif(btrim(p_payload ->> 'fiscalState'), '');
  v_representative text := nullif(btrim(p_payload ->> 'legalRepresentativeName'), '');
  v_contact_name text;
  v_contact_email text := nullif(lower(btrim(p_payload ->> 'contactEmail')), '');
  v_contact_phone text;
  v_company_id uuid;
  v_unit_id uuid;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be an object' using errcode = '22023';
  end if;

  -- Lock the caller's profile so two concurrent calls cannot create two companies.
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found' using errcode = '42501';
  end if;
  if v_profile.role not in ('shipper', 'manager') then
    raise exception 'role % cannot register a company', v_profile.role using errcode = '42501';
  end if;
  if v_profile.company_id is not null then
    raise exception 'user already belongs to a company' using errcode = '42501';
  end if;

  if v_kind is null or v_kind not in ('shipper', 'carrier', 'owner_operator') then
    raise exception 'kind must be shipper, carrier or owner_operator' using errcode = '22023';
  end if;
  if (v_profile.role = 'shipper') <> (v_kind = 'shipper') then
    raise exception 'role % cannot register a % company', v_profile.role, v_kind using errcode = '42501';
  end if;

  if v_legal_name is null or char_length(v_legal_name) > 300 then
    raise exception 'legalName is required' using errcode = '22023';
  end if;
  if v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
     or v_rfc in ('XAXX010101000', 'XEXX010101000')
     or substring(v_rfc from '[0-9]{6}') !~ '^[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'invalid rfc' using errcode = '22023';
  end if;
  if v_street is null or v_exterior is null or v_neighborhood is null
     or v_postal_code is null or v_municipality is null or v_state is null then
    raise exception 'the fiscal address is incomplete' using errcode = '22023';
  end if;
  if v_postal_code !~ '^[0-9]{5}$' then
    raise exception 'invalid fiscalPostalCode' using errcode = '22023';
  end if;
  if char_length(v_rfc) = 12 and v_representative is null then
    raise exception 'legalRepresentativeName is required for a persona moral' using errcode = '22023';
  end if;
  if v_contact_email is not null
     and (char_length(v_contact_email) > 320 or v_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid contactEmail' using errcode = '22023';
  end if;

  -- The contact defaults to the person who registers.
  v_contact_name := coalesce(nullif(btrim(p_payload ->> 'contactName'), ''), v_profile.full_name);
  v_contact_phone := coalesce(
    public.normalize_mx_phone(p_payload ->> 'contactPhone'), v_profile.phone
  );
  if p_payload ->> 'contactPhone' is not null and public.normalize_mx_phone(p_payload ->> 'contactPhone') is null then
    raise exception 'invalid contactPhone' using errcode = '22023';
  end if;

  begin
    insert into public.companies (
      type, legal_name, rfc, contact_name, contact_email, contact_phone,
      fiscal_street, fiscal_exterior_number, fiscal_interior_number, fiscal_neighborhood,
      fiscal_postal_code, fiscal_municipality, fiscal_state, legal_representative_name,
      is_owner_operator, created_by
    )
    values (
      case v_kind when 'shipper' then 'shipper' else 'carrier' end::public.company_type,
      v_legal_name, v_rfc, left(v_contact_name, 200), v_contact_email, v_contact_phone,
      v_street, v_exterior, v_interior, v_neighborhood,
      v_postal_code, v_municipality, v_state, v_representative,
      v_kind = 'owner_operator', v_uid
    )
    returning id into v_company_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'companies_rfc_key' then
        -- D50-5: a stable error for a repeated RFC. The code stays 23505 and
        -- the message keeps the constraint name (the builds from before S1
        -- read them); the detail `rfc_taken` is what the apps map to the
        -- field "RFC" from now on.
        raise exception 'rfc already registered (companies_rfc_key)'
          using errcode = '23505', detail = 'rfc_taken';
      end if;
      raise;
  end;

  update public.profiles set company_id = v_company_id where id = v_uid;

  if v_kind = 'owner_operator' then
    -- The "Principal" business unit the companies trigger just created.
    select b.id into v_unit_id
    from public.business_units b
    where b.company_id = v_company_id and b.archived_at is null;
    insert into public.operators (company_id, business_unit_id, profile_id, full_name, email, phone)
    values (
      v_company_id, v_unit_id, v_uid,
      left(coalesce(v_profile.full_name, v_contact_name, v_legal_name), 200),
      (select lower(u.email) from auth.users u where u.id = v_uid and u.email !~ '@tel\.transport\.invalid$'),
      v_profile.phone
    );
  end if;

  return v_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- D50-2 · The phone of an invited operator
-- ---------------------------------------------------------------------------
alter table public.invitations
  add column invitee_phone text,
  add constraint invitations_invitee_phone_format check (
    invitee_phone is null or (kind = 'operator' and invitee_phone ~ '^\+[1-9][0-9]{7,14}$')
  );

comment on column public.invitations.invitee_phone is
  'Phone of the invited operator in E.164 (D50-2), typed by whoever invites: it prefills the operator''s sign-up. Optional; only for `operator` links.';

-- No column grant on purpose: the clients read `invitations` by column
-- (G1b), and the phone is not one of them. It leaves the table only through
-- invitation_preview, for whoever holds the token.

-- The signature changes (a new last parameter), so the function is dropped
-- and created again: PostgREST must not see two overloads.
drop function public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer);

-- Same as 20261028000000_registration.sql, except an `operator` invitation
-- may carry the invitee's phone (p_invitee_phone, normalized with
-- normalize_mx_phone; else the phone of the operator row the link is for).
create function public.create_invitation(
  p_kind public.invitation_kind,
  p_business_unit_ids uuid[],
  p_operator_id uuid default null,
  p_invitee_name text default null,
  p_valid_for_hours integer default 168,
  p_invitee_phone text default null
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_company_id uuid := public.auth_carrier_company_id();
  v_units uuid[];
  v_operator public.operators%rowtype;
  v_operator_role public.user_role;
  v_name text := nullif(btrim(p_invitee_name), '');
  v_phone text := public.normalize_mx_phone(p_invitee_phone);
  v_token text;
  v_expires_at timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'only the staff of a carrier company can invite' using errcode = '42501';
  end if;
  if p_kind is null then
    raise exception 'p_kind is required' using errcode = '22023';
  end if;
  if p_valid_for_hours is null or p_valid_for_hours not between 1 and 720 then
    raise exception 'p_valid_for_hours must be between 1 and 720' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 200 then
    raise exception 'p_invitee_name is too long' using errcode = '22023';
  end if;
  -- D50-2: the phone the operator will sign in with, typed by whoever
  -- invites them. Only an `operator` link carries one.
  if nullif(btrim(p_invitee_phone), '') is not null then
    if p_kind <> 'operator' then
      raise exception 'p_invitee_phone is only for operator invitations' using errcode = '22023';
    end if;
    if v_phone is null then
      raise exception 'invalid p_invitee_phone' using errcode = '22023';
    end if;
  end if;

  select coalesce(array_agg(distinct u order by u), '{}') into v_units
  from unnest(p_business_unit_ids) u where u is not null;

  if p_kind = 'coordinator' then
    if not public.auth_is_manager() then
      raise exception 'only the manager invites coordinators' using errcode = '42501';
    end if;
    if p_operator_id is not null then
      raise exception 'p_operator_id is not for coordinator invitations' using errcode = '22023';
    end if;
    if cardinality(v_units) = 0 then
      raise exception 'at least one business unit is required' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(v_units) u
      where not exists (
        select 1 from public.business_units b
        where b.id = u and b.company_id = v_company_id and b.archived_at is null
      )
    ) then
      raise exception 'business unit not found' using errcode = '42501';
    end if;
  elsif p_kind = 'operator' and p_operator_id is null then
    if cardinality(v_units) <> 1 then
      raise exception 'exactly one business unit is required' using errcode = '22023';
    end if;
    if not public.can_operate_unit(v_units[1]) or not exists (
      select 1 from public.business_units b
      where b.id = v_units[1] and b.company_id = v_company_id and b.archived_at is null
    ) then
      raise exception 'business unit not found' using errcode = '42501';
    end if;
  else
    -- An existing operator row: linked by an `operator` link (no account yet)
    -- or reset by an `operator_access_reset` link (account required).
    if p_operator_id is null then
      raise exception 'p_operator_id is required' using errcode = '22023';
    end if;
    -- The caller is authorized before the row is locked, so nobody holds a
    -- lock on an operator they cannot operate. Lock order (shared with
    -- redeem_operator_invitation_service): the operator row, then its
    -- invitations.
    select * into v_operator from public.operators where id = p_operator_id;
    if not found or not public.can_operate_unit(v_operator.business_unit_id) then
      raise exception 'operator not found' using errcode = '42501';
    end if;
    select * into v_operator from public.operators where id = p_operator_id for update;
    if not public.can_operate_unit(v_operator.business_unit_id) then
      raise exception 'operator not found' using errcode = '42501';
    end if;
    if v_operator.archived_at is not null then
      raise exception 'operator is archived' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.business_units b where b.id = v_operator.business_unit_id and b.archived_at is null
    ) then
      raise exception 'business unit is archived' using errcode = '22023';
    end if;
    if cardinality(v_units) = 0 then
      v_units := array[v_operator.business_unit_id];
    elsif v_units <> array[v_operator.business_unit_id] then
      raise exception 'the business unit must be the operator''s' using errcode = '22023';
    end if;

    if p_kind = 'operator' then
      if v_operator.profile_id is not null then
        raise exception 'operator already has an account' using errcode = '22023';
      end if;
      update public.invitations
      set revoked_at = now()
      where operator_id = v_operator.id and kind = 'operator'
        and accepted_at is null and revoked_at is null;
    else
      if v_operator.profile_id is null then
        raise exception 'operator has no account' using errcode = '22023';
      end if;
      select p.role into v_operator_role
      from public.profiles p
      where p.id = v_operator.profile_id and p.company_id = v_operator.company_id;
      if v_operator_role is distinct from 'operator' then
        raise exception 'only an operator account can be reset' using errcode = '42501';
      end if;
      update public.invitations
      set revoked_at = now()
      where operator_id = v_operator.id and kind = 'operator_access_reset'
        and accepted_at is null and revoked_at is null;
    end if;
  end if;

  -- 32 random bytes (256 bits) in base64url: 43 characters, no padding.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  v_expires_at := now() + make_interval(hours => p_valid_for_hours);

  insert into public.invitations (
    company_id, kind, business_unit_ids, operator_id, invitee_name, invitee_phone, token_hash, expires_at, created_by
  )
  values (
    v_company_id, p_kind, v_units, v_operator.id,
    coalesce(v_name, case when p_kind = 'operator' then v_operator.full_name end),
    -- Like the name: the phone typed now, else the one on the operator row
    -- the link is for (when it is a phone the sign-in accepts).
    case when p_kind = 'operator' then coalesce(v_phone, public.normalize_mx_phone(v_operator.phone)) end,
    public.invitation_token_hash(v_token), v_expires_at, v_uid
  )
  returning id into v_id;

  return query select v_id, v_token, v_expires_at;
end;
$$;

comment on function public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer, text) is
  'Issues a single-use invitation link (G1b): coordinator (manager only), operator or operator_access_reset. '
  'An operator link may carry the invitee''s name and phone (D50-2). Returns the token once; only its hash is stored.';

revoke all on function public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer, text) from public, anon;
grant execute on function public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer, text) to authenticated;

-- The row type changes (a new last column), so the function is dropped and
-- created again with the same grants: the token is the credential, so it is
-- open to anon by design (G1b).
drop function public.invitation_preview(text);

-- Same as 20261028000000_registration.sql, except it also returns the phone
-- of an `operator` invitation (null for the other kinds and for the links
-- from before S1).
create function public.invitation_preview(p_token text)
returns table (
  kind public.invitation_kind,
  company_legal_name text,
  business_unit_names text[],
  inviter_name text,
  invitee_name text,
  expires_at timestamptz,
  invitee_phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_hash bytea := public.invitation_token_hash(p_token);
  v_invitation public.invitations%rowtype;
  v_company public.companies%rowtype;
  v_names text[];
begin
  if v_hash is not null then
    select * into v_invitation from public.invitations i where i.token_hash = v_hash;
  end if;
  if v_invitation.id is null
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now() then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  select * into v_company from public.companies c where c.id = v_invitation.company_id;
  if v_company.archived_at is not null then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  select array_agg(b.name order by b.name) into v_names
  from public.business_units b
  where b.id = any (v_invitation.business_unit_ids) and b.archived_at is null;
  if v_names is null then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  if v_invitation.kind = 'operator_access_reset' and not exists (
    select 1 from public.operators o
    join public.profiles p on p.id = o.profile_id and p.role = 'operator' and p.company_id = o.company_id
    where o.id = v_invitation.operator_id and o.archived_at is null
  ) then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;
  if v_invitation.kind = 'operator' and v_invitation.operator_id is not null and not exists (
    select 1 from public.operators o
    where o.id = v_invitation.operator_id and o.profile_id is null and o.archived_at is null
      and o.business_unit_id = v_invitation.business_unit_ids[1]
  ) then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  return query
  select v_invitation.kind,
         v_company.legal_name,
         v_names,
         (select p.full_name from public.profiles p where p.id = v_invitation.created_by),
         v_invitation.invitee_name,
         v_invitation.expires_at,
         case when v_invitation.kind = 'operator' then v_invitation.invitee_phone end;
end;
$$;

comment on function public.invitation_preview(text) is
  'What an invitation link offers (G1b), for whoever holds the token: kind, company, business units, inviter, '
  'and the invitee''s name and phone when the inviter typed them (D50-2). Same error for unknown, used, revoked or expired.';

revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated, service_role;
