-- G2 · Registration (D13, D15-E1, D16, plan §G G2).
--   * Fiscal data of every company (razón social, RFC, domicilio fiscal and
--     representante legal): columns on companies, company_missing_fields and
--     review_company, which no longer approves a company with gaps.
--   * register_company(p_payload): a shipper, a carrier company or a
--     hombre-camión (manager + their own operator row, D13) in one call.
--     create_company stays as a wrapper for older builds.
--   * The phone of every account: profiles.phone in E.164, normalized on the
--     way in (normalize_mx_phone) and required by handle_new_user.
--   * Phone-only operators (D15-E1): their Auth account is created only by the
--     Edge Function redeem-invitation (service role), which marks it with
--     app_metadata.provisioned_by; handle_new_user refuses any other operator
--     sign-up. The operator invitation codes of B04 are retired: the pending
--     ones are revoked and their RPCs dropped (the table stays as history).
--   * Invitation links (G1b) may now target an operator row that has no
--     account yet (the rows the manager registers in the app), so that row is
--     linked instead of a new one being created.
--   * Rate limits of redeem-invitation (per IP and per token).

-- ---------------------------------------------------------------------------
-- Phones: one format, E.164. Mirror of normalizeMxPhone in @transport/shared.
-- ---------------------------------------------------------------------------
create function public.normalize_mx_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    -- 10 Mexican digits, with or without 52 / +52 and the old mobile prefix 1.
    when v.compact ~ '^(\+?52)?1?[0-9]{10}$' then '+52' || right(v.compact, 10)
    when v.compact ~ '^\+[1-9][0-9]{7,14}$' then v.compact
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g') as compact) v;
$$;

comment on function public.normalize_mx_phone(text) is
  'The E.164 form of a phone as people type it (10 Mexican digits, +52, or any E.164), or null.';

revoke all on function public.normalize_mx_phone(text) from public, anon;
grant execute on function public.normalize_mx_phone(text) to authenticated, service_role;

-- Existing phones: spaces and dashes removed; anything that is not a phone is
-- dropped (the account sees "Completa tu teléfono").
update public.profiles set phone = public.normalize_mx_phone(phone) where phone is not null;

alter table public.profiles
  add constraint profiles_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

-- Clients may update their phone (B01 grant): normalize it, refuse junk.
create function public.profiles_normalize_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is not null then
    new.phone := public.normalize_mx_phone(new.phone);
    if new.phone is null then
      raise exception 'invalid phone' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_normalize_phone() from public, anon, authenticated;

create trigger profiles_normalize_phone
before insert or update of phone on public.profiles
for each row execute function public.profiles_normalize_phone();

-- ---------------------------------------------------------------------------
-- Fiscal data of companies (D16)
-- ---------------------------------------------------------------------------
alter table public.companies
  add column fiscal_street text
    constraint companies_fiscal_street_length check (char_length(fiscal_street) <= 200),
  add column fiscal_exterior_number text
    constraint companies_fiscal_exterior_number_length check (char_length(fiscal_exterior_number) <= 20),
  add column fiscal_interior_number text
    constraint companies_fiscal_interior_number_length check (char_length(fiscal_interior_number) <= 20),
  add column fiscal_neighborhood text
    constraint companies_fiscal_neighborhood_length check (char_length(fiscal_neighborhood) <= 120),
  add column fiscal_postal_code text
    constraint companies_fiscal_postal_code_format check (fiscal_postal_code ~ '^[0-9]{5}$'),
  add column fiscal_municipality text
    constraint companies_fiscal_municipality_length check (char_length(fiscal_municipality) <= 120),
  -- The 32 federative entities; mirror of MX_STATES in @transport/shared.
  add column fiscal_state text
    constraint companies_fiscal_state_valid check (fiscal_state in (
      'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
      'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
      'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
      'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
      'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
    )),
  add column legal_representative_name text
    constraint companies_legal_representative_name_length check (char_length(legal_representative_name) <= 200);

comment on column public.companies.fiscal_state is
  'One of the 32 federative entities of Mexico (MX_STATES in @transport/shared).';
comment on column public.companies.legal_representative_name is
  'Required for a persona moral (12-character RFC); a persona física is their own representative.';

-- The staff may complete them while the company is in review (the guard
-- below freezes them once it is approved, like legal_name).
grant update (
  fiscal_street, fiscal_exterior_number, fiscal_interior_number, fiscal_neighborhood,
  fiscal_postal_code, fiscal_municipality, fiscal_state, legal_representative_name
) on table public.companies to authenticated;

-- Same as 20261015040644_identity.sql, except the fiscal data is frozen with
-- the legal name once the company is approved.
create or replace function public.companies_guard_verified_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and old.status = 'approved'
     and (
       new.legal_name is distinct from old.legal_name
       or new.fiscal_street is distinct from old.fiscal_street
       or new.fiscal_exterior_number is distinct from old.fiscal_exterior_number
       or new.fiscal_interior_number is distinct from old.fiscal_interior_number
       or new.fiscal_neighborhood is distinct from old.fiscal_neighborhood
       or new.fiscal_postal_code is distinct from old.fiscal_postal_code
       or new.fiscal_municipality is distinct from old.fiscal_municipality
       or new.fiscal_state is distinct from old.fiscal_state
       or new.legal_representative_name is distinct from old.legal_representative_name
     )
     and not public.is_admin() then
    raise exception 'the verified data of an approved company cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The fiscal columns still empty, in the order of the form. The legal
-- representative is required only for a persona moral (12-character RFC).
-- Security invoker: callers only see what RLS lets them see; null when the
-- company is not visible.
create function public.company_missing_fields(p_company_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_remove(array[
    case when nullif(btrim(c.fiscal_street), '') is null then 'fiscal_street' end,
    case when nullif(btrim(c.fiscal_exterior_number), '') is null then 'fiscal_exterior_number' end,
    case when nullif(btrim(c.fiscal_neighborhood), '') is null then 'fiscal_neighborhood' end,
    case when c.fiscal_postal_code is null then 'fiscal_postal_code' end,
    case when nullif(btrim(c.fiscal_municipality), '') is null then 'fiscal_municipality' end,
    case when c.fiscal_state is null then 'fiscal_state' end,
    case when char_length(c.rfc) = 12 and nullif(btrim(c.legal_representative_name), '') is null
         then 'legal_representative_name' end
  ], null)
  from public.companies c
  where c.id = p_company_id;
$$;

comment on function public.company_missing_fields(uuid) is
  'Fiscal columns of a company still empty (G2); review_company does not approve a company with any.';

revoke all on function public.company_missing_fields(uuid) from public, anon;
grant execute on function public.company_missing_fields(uuid) to authenticated, service_role;

-- Same as 20261015050000_documents_verification.sql, except an approval also
-- needs the fiscal data complete (company_missing_fields).
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

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provisioning tickets of phone-only operators (D15-E1). GoTrue writes
-- app_metadata only after inserting the user, so handle_new_user (which runs
-- on that insert) cannot see it. Instead, right before calling the admin API
-- the Edge Function redeem-invitation issues a single-use ticket for the
-- synthetic email, bound to the SHA-256 of a random nonce it then sends in
-- user_metadata. Only the service role can issue one, so a public sign-up can
-- never present a valid ticket. Tickets live five minutes and are consumed by
-- handle_new_user.
-- ---------------------------------------------------------------------------
create table public.operator_provisioning_tickets (
  email text primary key
    constraint operator_provisioning_tickets_email_format check (email = lower(email) and email like '%@%'),
  nonce_hash bytea not null
    constraint operator_provisioning_tickets_nonce_hash_length check (octet_length(nonce_hash) = 32),
  expires_at timestamptz not null
);

comment on table public.operator_provisioning_tickets is
  'Single-use tickets that let redeem-invitation (service role) create an operator account (G2).';

-- No client ever reads or writes them: RLS on and no policy.
alter table public.operator_provisioning_tickets enable row level security;
revoke all on table public.operator_provisioning_tickets from public, anon, authenticated;

create function public.issue_operator_provisioning_ticket_service(p_email text, p_nonce text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Explicit caller check on top of the grant: only the service role key.
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_nonce is null or char_length(p_nonce) < 32 then
    raise exception 'the nonce must have at least 32 characters' using errcode = '22023';
  end if;
  delete from public.operator_provisioning_tickets where expires_at <= now();
  insert into public.operator_provisioning_tickets (email, nonce_hash, expires_at)
  values (lower(p_email), extensions.digest(p_nonce, 'sha256'), now() + interval '5 minutes')
  on conflict (email) do update
    set nonce_hash = excluded.nonce_hash, expires_at = excluded.expires_at;
end;
$$;

comment on function public.issue_operator_provisioning_ticket_service(text, text) is
  'Issues the single-use ticket handle_new_user requires to create an operator account (G2). Service role only.';

revoke all on function public.issue_operator_provisioning_ticket_service(text, text) from public, anon, authenticated;
grant execute on function public.issue_operator_provisioning_ticket_service(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Sign-up trigger. Same as 20261026000100_manager_role_functions.sql, except:
--   * the phone is required of every role and stored in E.164;
--   * an operator account, or any account on the synthetic email domain of
--     phones, is accepted only when the service role provisioned it: a valid
--     ticket of operator_provisioning_tickets (redeem-invitation), consumed
--     here, or app_metadata.provisioned_by already present at insert (only
--     direct SQL, such as the seed, can do that: GoTrue writes app_metadata
--     after the insert). Nobody creates an operator without a link.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
  v_phone text := public.normalize_mx_phone(new.raw_user_meta_data ->> 'phone');
  v_nonce text := new.raw_user_meta_data ->> 'provisioning_nonce';
  v_provisioned boolean := new.raw_app_meta_data ->> 'provisioned_by' = 'redeem-invitation';
begin
  if not coalesce(v_provisioned, false) and v_nonce is not null then
    delete from public.operator_provisioning_tickets t
    where t.email = lower(new.email)
      and t.nonce_hash = extensions.digest(v_nonce, 'sha256')
      and t.expires_at > now();
    v_provisioned := found;
  end if;
  v_provisioned := coalesce(v_provisioned, false);

  -- Builds from before G1a still sign carriers up as 'carrier'.
  if v_role = 'carrier' then
    v_role := 'manager';
  end if;
  if v_role is null or v_role not in ('shipper', 'manager', 'coordinator', 'operator') then
    raise exception 'invalid sign-up role: %', coalesce(v_role, '(missing)')
      using errcode = '22023';
  end if;
  if v_role = 'operator' and not v_provisioned then
    raise exception 'operator accounts are created only through an invitation'
      using errcode = '42501';
  end if;
  -- The synthetic emails of phone-only operators (phoneAuthEmail) belong to
  -- the Edge Function too: a public sign-up with one would squat that phone
  -- (the operator's account could no longer be created).
  if lower(new.email) like '%@tel.transport.invalid' and not v_provisioned then
    raise exception 'operator accounts are created only through an invitation'
      using errcode = '42501';
  end if;
  if v_phone is null then
    raise exception 'phone is required' using errcode = '22023';
  end if;

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    v_role::public.user_role,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_phone
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: register the caller's company with its fiscal data (D16).
--   kind: shipper (a shipper account), carrier (a manager account) or
--   owner_operator (a manager who drives their own truck, D13: the company
--   is marked is_owner_operator and gets an operator row linked to the
--   caller, in its "Principal" business unit). Everything happens in one
--   transaction. The RFC format, the postal code and the state are checked
--   here and by the table; the RFC date and check digit stay with the apps
--   and the admin (B02).
-- ---------------------------------------------------------------------------
create function public.register_company(p_payload jsonb)
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

comment on function public.register_company(jsonb) is
  'Registers the caller''s company with its fiscal data (G2): shipper, carrier or owner_operator '
  '(manager + own operator row, D13). One company per user; the profile is locked.';

revoke all on function public.register_company(jsonb) from public, anon;
grant execute on function public.register_company(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The operator invitation codes of B04 are retired (D15-E1): pending codes
-- are revoked and the RPCs dropped. operator_invitations stays as history.
-- ---------------------------------------------------------------------------
update public.operator_invitations
set revoked_at = now()
where accepted_at is null and revoked_at is null;

drop function public.create_operator_invitation(uuid, integer);
drop function public.revoke_operator_invitation(uuid);
drop function public.accept_operator_invitation(text);
drop trigger operators_revoke_invitations_on_email_change on public.operators;
drop function public.operators_revoke_invitations_on_email_change();

-- ---------------------------------------------------------------------------
-- Rate limits of the Edge Function redeem-invitation (service role): per
-- client IP (hashed) and per token, so a stolen link cannot be brute forced
-- against the password rules and one address cannot mint accounts in bulk.
-- Same as 20261027020100_share_links.sql (G7), except it adds those two buckets.
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
    -- G1b: invitation links. Inviting is manual; this stops a script from
    -- minting links in bulk.
    ('create_invitation', 'rpc', 20, 60),
    -- G7: a person shares a handful of links; this only stops scripts.
    ('create_share_link', 'rpc', 30, 60),
    -- G2: redeeming a link (Edge Function), per IP and per token, 10 minutes.
    ('redeem-invitation-ip', 'service', 20, 600),
    ('redeem-invitation-token', 'service', 5, 600)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

-- ---------------------------------------------------------------------------
-- Invitation links (G1b) for an operator row without an account: the manager
-- registers the operator's data and license in the app (B18) and then shares
-- a link; redeeming it links that row instead of creating a new one.
-- ---------------------------------------------------------------------------
alter table public.invitations drop constraint invitations_shape;
alter table public.invitations add constraint invitations_shape check (
  case kind
    when 'coordinator' then cardinality(business_unit_ids) >= 1 and operator_id is null
    -- operator_id: the row to link (set when created) or the row created on
    -- redemption; always set once accepted.
    when 'operator' then cardinality(business_unit_ids) = 1 and (accepted_at is null or operator_id is not null)
    when 'operator_access_reset' then cardinality(business_unit_ids) = 1 and operator_id is not null
  end
);

-- Same as 20261027000100_invitations.sql, except an `operator` invitation may
-- name an operator row without an account (of a business unit the caller
-- operates); re-issuing revokes the pending link of the same row.
create or replace function public.create_invitation(
  p_kind public.invitation_kind,
  p_business_unit_ids uuid[],
  p_operator_id uuid default null,
  p_invitee_name text default null,
  p_valid_for_hours integer default 168
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
    company_id, kind, business_unit_ids, operator_id, invitee_name, token_hash, expires_at, created_by
  )
  values (
    v_company_id, p_kind, v_units, v_operator.id,
    coalesce(v_name, case when p_kind = 'operator' then v_operator.full_name end),
    public.invitation_token_hash(v_token), v_expires_at, v_uid
  )
  returning id into v_id;

  return query select v_id, v_token, v_expires_at;
end;
$$;

-- Same as 20261027000100_invitations.sql, except an `operator` link that
-- names a row is no longer valid once that row has an account or is archived.
create or replace function public.invitation_preview(p_token text)
returns table (
  kind public.invitation_kind,
  company_legal_name text,
  business_unit_names text[],
  inviter_name text,
  invitee_name text,
  expires_at timestamptz
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
  ) then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  return query
  select v_invitation.kind,
         v_company.legal_name,
         v_names,
         (select p.full_name from public.profiles p where p.id = v_invitation.created_by),
         v_invitation.invitee_name,
         v_invitation.expires_at;
end;
$$;

-- Same as 20261027000100_invitations.sql, except an `operator` link that
-- names a row links that row (locked first, like a reset) instead of
-- inserting one, and the operator's phone and email are kept in E.164 and
-- lowercase.
create or replace function public.redeem_operator_invitation_service(
  p_token text,
  p_user_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_email text default null
)
returns table (operator_id uuid, profile_id uuid, kind public.invitation_kind)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_hash bytea := public.invitation_token_hash(p_token);
  v_invitation public.invitations%rowtype;
  v_locked_operator_id uuid;
  v_operator public.operators%rowtype;
  v_profile public.profiles%rowtype;
  v_full_name text;
  v_phone text := public.normalize_mx_phone(p_phone);
  v_email text := nullif(lower(btrim(p_email)), '');
  v_operator_id uuid;
  v_profile_id uuid;
begin
  -- Explicit caller check on top of the grant: only the service role key
  -- (its JWT role claim).
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_phone is not null and v_phone is null then
    raise exception 'invalid phone' using errcode = '22023';
  end if;

  if v_hash is not null then
    -- A link that names an operator locks that row first. operator_id never
    -- changes once set, so it can be read before locking the invitation.
    select i.operator_id into v_locked_operator_id
    from public.invitations i
    where i.token_hash = v_hash and i.kind in ('operator', 'operator_access_reset');
    if v_locked_operator_id is not null then
      perform 1 from public.operators o where o.id = v_locked_operator_id for update;
    end if;
    select * into v_invitation from public.invitations where token_hash = v_hash for update;
  end if;
  if v_invitation.id is null
     or v_invitation.kind = 'coordinator'
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now()
     or exists (select 1 from public.companies c where c.id = v_invitation.company_id and c.archived_at is not null)
     or not exists (
       select 1 from public.business_units b
       where b.id = v_invitation.business_unit_ids[1] and b.archived_at is null
     ) then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  if v_invitation.kind = 'operator' then
    if p_user_id is null then
      raise exception 'p_user_id is required' using errcode = '22023';
    end if;
    v_full_name := coalesce(nullif(btrim(p_full_name), ''), v_invitation.invitee_name);
    if v_full_name is null or char_length(v_full_name) > 200 then
      raise exception 'p_full_name is required' using errcode = '22023';
    end if;

    select * into v_profile from public.profiles where id = p_user_id for update;
    if not found or v_profile.role <> 'operator' then
      raise exception 'only operator accounts can redeem this invitation' using errcode = '42501';
    end if;
    if v_profile.company_id is not null
       or exists (select 1 from public.operators o where o.profile_id = p_user_id) then
      raise exception 'user already belongs to a company' using errcode = '42501';
    end if;

    if v_invitation.operator_id is not null then
      -- The row the manager registered: still without an account and active.
      update public.operators
      set profile_id = p_user_id,
          phone = coalesce(phone, v_phone),
          email = coalesce(email, v_email)
      where id = v_invitation.operator_id and profile_id is null and archived_at is null
      returning id into v_operator_id;
      if v_operator_id is null then
        raise exception 'invalid or expired invitation' using errcode = '22023';
      end if;
    else
      insert into public.operators (company_id, business_unit_id, profile_id, full_name, phone, email)
      values (v_invitation.company_id, v_invitation.business_unit_ids[1], p_user_id, v_full_name, v_phone, v_email)
      returning id into v_operator_id;
    end if;

    update public.profiles
    set company_id = v_invitation.company_id,
        full_name = coalesce(full_name, v_full_name),
        phone = coalesce(phone, v_phone)
    where id = p_user_id;

    update public.invitations
    set operator_id = v_operator_id, accepted_at = now(), accepted_by = p_user_id
    where id = v_invitation.id;

    v_profile_id := p_user_id;
  else
    if p_user_id is not null then
      raise exception 'p_user_id is not for an access reset' using errcode = '22023';
    end if;
    select * into v_operator from public.operators where id = v_invitation.operator_id;
    -- The operator may have lost the account or been archived since; and
    -- only an operator account is ever reset (never a manager's).
    if v_operator.archived_at is not null
       or v_operator.profile_id is null
       or not exists (
         select 1 from public.profiles p
         where p.id = v_operator.profile_id and p.role = 'operator' and p.company_id = v_operator.company_id
       ) then
      raise exception 'invalid or expired invitation' using errcode = '22023';
    end if;

    update public.invitations
    set accepted_at = now(), accepted_by = v_operator.profile_id
    where id = v_invitation.id;

    v_operator_id := v_operator.id;
    v_profile_id := v_operator.profile_id;
  end if;

  return query select v_operator_id, v_profile_id, v_invitation.kind;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC (service role only): end every session of a user. The Edge Function
-- redeem-invitation calls it after an access reset sets the new password, so
-- a phone that changed hands cannot keep an old session alive. Only the
-- sessions and refresh tokens of auth are touched; the account stays.
-- ---------------------------------------------------------------------------
create function public.revoke_user_sessions_service(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Explicit caller check on top of the grant: only the service role key
  -- (its JWT role claim).
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'user not found' using errcode = '22023';
  end if;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.revoke_user_sessions_service(uuid) is
  'Ends every session of a user (G2, after an operator access reset). Service role only.';

revoke all on function public.revoke_user_sessions_service(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions_service(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC (service role only): the compensation of redeem-invitation. Deletes the
-- account it just created only if the redemption did not take. The profile
-- is locked first, so a redemption still in flight (its answer lost or timed
-- out) finishes before the check: a linked account is never deleted.
-- Returns true when the account was deleted.
-- ---------------------------------------------------------------------------
create function public.discard_unredeemed_operator_service(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  -- Explicit caller check on top of the grant: only the service role key.
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return false;
  end if;
  if v_profile.role <> 'operator'
     or v_profile.company_id is not null
     or exists (select 1 from public.operators o where o.profile_id = p_user_id)
     or not exists (
       select 1 from auth.users u
       where u.id = p_user_id and u.raw_app_meta_data ->> 'provisioned_by' = 'redeem-invitation'
     ) then
    return false;
  end if;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

comment on function public.discard_unredeemed_operator_service(uuid) is
  'Compensation of redeem-invitation (G2): deletes a just-created operator account only if it was not linked. Service role only.';

revoke all on function public.discard_unredeemed_operator_service(uuid) from public, anon, authenticated;
grant execute on function public.discard_unredeemed_operator_service(uuid) to service_role;
