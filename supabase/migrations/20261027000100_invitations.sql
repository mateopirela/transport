-- G1b · Invitations by link: coordinator and operator (D15-E1, D19, plan §G).
--   The manager invites coordinators (and assigns them business units); the
--   manager or a coordinator invites operators into one of their business
--   units, or lets an operator who forgot the password reset the access.
--   Each invitation is a single-use link with a random token: 32 bytes in
--   base64url (43 characters), of which only the SHA-256 is stored. The link
--   is /invitacion/<token> on the web and transport://invitacion/<token> in
--   the app. It expires after 7 days by default (1 to 720 hours).
--
--   Clients only read invitations (never the token hash) and act through the
--   RPCs below. The anonymous preview (invitation_preview) answers only to a
--   valid token and never returns ids. The operator redemption runs with the
--   service role (the Edge Function of G2 creates the Auth user).
--
--   operator_invitations (B04, codes bound to an email) stays as it is; G2
--   retires it.

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.invitation_kind not null,
  -- Coordinator: one or more business units to run. Operator kinds: exactly
  -- the one the operator drives for. Checked by invitations_check_shape.
  business_unit_ids uuid[] not null,
  -- The operator: required for an access reset; set when an operator
  -- invitation is redeemed (the row is created then); never for coordinators.
  operator_id uuid,
  -- Only to show whom the link is for.
  invitee_name text,
  token_hash bytea not null,
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  constraint invitations_token_hash_key unique (token_hash),
  constraint invitations_operator_fkey
    foreign key (company_id, operator_id) references public.operators (company_id, id) on delete cascade,
  constraint invitations_single_outcome check (accepted_at is null or revoked_at is null),
  constraint invitations_invitee_name_length
    check (invitee_name is null or char_length(btrim(invitee_name)) between 1 and 200),
  constraint invitations_shape check (
    case kind
      when 'coordinator' then cardinality(business_unit_ids) >= 1 and operator_id is null
      when 'operator' then cardinality(business_unit_ids) = 1 and (operator_id is null) = (accepted_at is null)
      when 'operator_access_reset' then cardinality(business_unit_ids) = 1 and operator_id is not null
    end
  )
);

comment on table public.invitations is
  'Single-use invitation links for coordinators and operators (G1b). Written only by the RPCs; '
  'clients never read token_hash.';
comment on column public.invitations.token_hash is
  'SHA-256 of the 43-character base64url token. The token itself is returned once by create_invitation.';
comment on column public.invitations.business_unit_ids is
  'Coordinator: the business units to run (1 or more). Operator kinds: the one business unit.';

create index invitations_company_idx on public.invitations (company_id);
create index invitations_operator_idx on public.invitations (operator_id) where operator_id is not null;

-- The business units exist, belong to the company, and do not repeat; an
-- operator belongs to the business unit. Not security definer: rows are only
-- written by the security definer RPCs (as the owner) or by the seed.
create function public.invitations_check_shape()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(new.business_unit_ids) u where u is null) then
    raise exception 'business_unit_ids cannot contain null' using errcode = '23514';
  end if;
  if (select count(distinct u) from unnest(new.business_unit_ids) u) <> cardinality(new.business_unit_ids) then
    raise exception 'business_unit_ids cannot repeat' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.business_unit_ids) u
    where not exists (select 1 from public.business_units b where b.id = u and b.company_id = new.company_id)
  ) then
    raise exception 'business units must belong to the company' using errcode = '23514';
  end if;
  if new.operator_id is not null and not exists (
    select 1 from public.operators o
    where o.id = new.operator_id and o.company_id = new.company_id and o.business_unit_id = new.business_unit_ids[1]
  ) then
    raise exception 'operator must belong to the business unit' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.invitations_check_shape() from public, anon, authenticated;

create trigger invitations_check_shape
before insert or update of company_id, kind, business_unit_ids, operator_id on public.invitations
for each row execute function public.invitations_check_shape();

-- ---------------------------------------------------------------------------
-- Rate limit (F12 pattern): one hit per invitation created, per user.
-- ---------------------------------------------------------------------------

-- Same as 20261025120000_incident_photos_clock_rate_limits.sql, except it
-- adds the create_invitation bucket.
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
    ('create_invitation', 'rpc', 20, 60)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

create trigger invitations_rate_limit before insert on public.invitations
for each row execute function public.enforce_rate_limit('create_invitation');

-- ---------------------------------------------------------------------------
-- Privileges and RLS. Clients read (never token_hash) and write only by RPC.
-- ---------------------------------------------------------------------------
revoke all on table public.invitations from anon, authenticated;
grant select (
  id, company_id, kind, business_unit_ids, operator_id, invitee_name, expires_at,
  created_by, created_at, accepted_at, accepted_by, revoked_at
) on table public.invitations to authenticated;

alter table public.invitations enable row level security;

-- The manager reads every invitation of the company; a coordinator, the
-- operator ones (invitations and access resets) of their business units; the
-- admin, all.
create policy invitations_select
on public.invitations
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or (kind <> 'coordinator' and business_unit_ids <@ (select public.auth_business_unit_ids())::uuid[])
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- Token helper: the hash of a well-formed token, or null. Checking the shape
-- first keeps every path from hashing arbitrary input.
-- ---------------------------------------------------------------------------
create function public.invitation_token_hash(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select case
    when p_token ~ '^[A-Za-z0-9_-]{43}$' then sha256(convert_to(p_token, 'UTF8'))
  end;
$$;

revoke all on function public.invitation_token_hash(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: create an invitation link. Returns the plain token once.
--   coordinator: only the manager, with one or more active business units.
--   operator: the manager, or a coordinator of that one business unit.
--   operator_access_reset: same, for an operator of that business unit who
--     already has an account; re-issuing revokes the pending reset of the
--     same operator. Only operator accounts can be reset: never a manager or
--     a coordinator (an owner-operator's operator row is linked to a manager).
-- ---------------------------------------------------------------------------
create function public.create_invitation(
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
  elsif p_kind = 'operator' then
    if p_operator_id is not null then
      raise exception 'p_operator_id is set when the invitation is redeemed' using errcode = '22023';
    end if;
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
    if v_operator.profile_id is null then
      raise exception 'operator has no account' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.business_units b where b.id = v_operator.business_unit_id and b.archived_at is null
    ) then
      raise exception 'business unit is archived' using errcode = '22023';
    end if;
    select p.role into v_operator_role
    from public.profiles p
    where p.id = v_operator.profile_id and p.company_id = v_operator.company_id;
    if v_operator_role is distinct from 'operator' then
      raise exception 'only an operator account can be reset' using errcode = '42501';
    end if;
    if cardinality(v_units) = 0 then
      v_units := array[v_operator.business_unit_id];
    elsif v_units <> array[v_operator.business_unit_id] then
      raise exception 'the business unit must be the operator''s' using errcode = '22023';
    end if;

    update public.invitations
    set revoked_at = now()
    where operator_id = v_operator.id and kind = 'operator_access_reset'
      and accepted_at is null and revoked_at is null;
  end if;

  -- 32 random bytes (256 bits) in base64url: 43 characters, no padding.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  v_expires_at := now() + make_interval(hours => p_valid_for_hours);

  insert into public.invitations (
    company_id, kind, business_unit_ids, operator_id, invitee_name, token_hash, expires_at, created_by
  )
  values (
    v_company_id, p_kind, v_units, v_operator.id, v_name, public.invitation_token_hash(v_token), v_expires_at, v_uid
  )
  returning id into v_id;

  return query select v_id, v_token, v_expires_at;
end;
$$;

revoke all on function public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer) from public, anon;
grant execute on function public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: revoke a pending invitation. The manager, any of the company; a
-- coordinator, the operator ones of their business units.
-- ---------------------------------------------------------------------------
create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_invitation from public.invitations where id = p_invitation_id for update;
  if not found
     or v_invitation.company_id is distinct from public.auth_carrier_company_id()
     or not (
       public.auth_is_manager()
       or (v_invitation.kind <> 'coordinator'
           and v_invitation.business_unit_ids <@ public.auth_business_unit_ids())
     ) then
    raise exception 'invitation not found' using errcode = '42501';
  end if;
  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null then
    raise exception 'invitation is no longer pending' using errcode = '22023';
  end if;

  update public.invitations set revoked_at = now() where id = p_invitation_id;
end;
$$;

revoke all on function public.revoke_invitation(uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: what a link is for, before signing up. Anyone with the token (anon
-- included: the web page and the app open it without a session) gets the
-- kind, the company's legal name, the active business units, who invites,
-- the invitee's name and the expiry; never an id. Unknown, malformed, used,
-- revoked and expired tokens all fail with the same error, as do links that
-- could no longer be redeemed (archived company or business units, an
-- operator without an account).
-- ---------------------------------------------------------------------------
create function public.invitation_preview(p_token text)
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

  return query
  select v_invitation.kind,
         v_company.legal_name,
         v_names,
         (select p.full_name from public.profiles p where p.id = v_invitation.created_by),
         v_invitation.invitee_name,
         v_invitation.expires_at;
end;
$$;

revoke all on function public.invitation_preview(text) from public;
-- Public by design: the link is the credential (256 bits of entropy).
grant execute on function public.invitation_preview(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: a coordinator joins the company of a coordinator invitation and runs
-- its business units. The caller signed up with role `coordinator`, has no
-- company yet and confirmed their email. Lock order: invitation, then the
-- caller's profile. Returns the company id.
-- ---------------------------------------------------------------------------
create function public.accept_coordinator_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_email_confirmed_at timestamptz;
  v_hash bytea := public.invitation_token_hash(p_token);
  v_invitation public.invitations%rowtype;
  v_units uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- The caller is checked before the token is looked up: a wrong account
  -- learns nothing about the link.
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.role <> 'coordinator' then
    raise exception 'only coordinator accounts can accept this invitation' using errcode = '42501';
  end if;
  if v_profile.company_id is not null then
    raise exception 'user already belongs to a company' using errcode = '42501';
  end if;
  select u.email_confirmed_at into v_email_confirmed_at from auth.users u where u.id = v_uid;
  if v_email_confirmed_at is null then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;

  if v_hash is not null then
    select * into v_invitation from public.invitations where token_hash = v_hash for update;
  end if;
  -- Same error for unknown, malformed, used, revoked and expired tokens.
  if v_invitation.id is null
     or v_invitation.kind <> 'coordinator'
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now()
     or exists (select 1 from public.companies c where c.id = v_invitation.company_id and c.archived_at is not null) then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  -- Business units archived since the link was created are skipped; a link
  -- with none left is no longer valid.
  select array_agg(b.id order by b.id) into v_units
  from public.business_units b
  where b.id = any (v_invitation.business_unit_ids) and b.archived_at is null;
  if v_units is null then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if v_profile.company_id is not null then
    raise exception 'user already belongs to a company' using errcode = '42501';
  end if;

  update public.profiles set company_id = v_invitation.company_id where id = v_uid;

  insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id, created_by)
  select u, v_invitation.company_id, v_uid, v_invitation.created_by
  from unnest(v_units) u;

  update public.invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invitation.id;

  return v_invitation.company_id;
end;
$$;

revoke all on function public.accept_coordinator_invitation(text) from public, anon;
grant execute on function public.accept_coordinator_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC (service role only): redeem an operator link. Called by the Edge
-- Function of G2, which creates the Auth user first.
--   operator: p_user_id is a new operator account (role operator, no company,
--     no operator row). Creates the operator row in the business unit, linked
--     to the account, and puts the company on the profile.
--   operator_access_reset: p_user_id is null. Validates, marks the link used
--     and returns the operator's profile id, so the Edge Function sets the
--     new password for that account and nothing else. A second redemption of
--     the same link fails.
-- Lock order (shared with create_invitation): the operator of a reset, then
-- the invitation; for a new operator, the invitation, then the profile.
-- ---------------------------------------------------------------------------
create function public.redeem_operator_invitation_service(
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
  v_reset_operator_id uuid;
  v_operator public.operators%rowtype;
  v_profile public.profiles%rowtype;
  v_full_name text;
  v_phone text := nullif(btrim(p_phone), '');
  v_email text := nullif(lower(btrim(p_email)), '');
  v_operator_id uuid;
  v_profile_id uuid;
begin
  -- Explicit caller check on top of the grant: only the service role key
  -- (its JWT role claim).
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if v_hash is not null then
    -- An access reset locks its operator first. operator_id never changes
    -- once set, so it can be read before locking the invitation.
    select i.operator_id into v_reset_operator_id
    from public.invitations i
    where i.token_hash = v_hash and i.kind = 'operator_access_reset';
    if v_reset_operator_id is not null then
      perform 1 from public.operators o where o.id = v_reset_operator_id for update;
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

    insert into public.operators (company_id, business_unit_id, profile_id, full_name, phone, email)
    values (v_invitation.company_id, v_invitation.business_unit_ids[1], p_user_id, v_full_name, v_phone, v_email)
    returning id into v_operator_id;

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

revoke all on function public.redeem_operator_invitation_service(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_operator_invitation_service(text, uuid, text, text, text) to service_role;
