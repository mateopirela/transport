-- B01 · Identity: companies, profiles, auth helpers and RLS.
--
-- Security model (docs/plan-v1.md §1, CONTRIBUTING.md):
--   * Every table has RLS enabled. Clients (role `authenticated`) only get the
--     column privileges they need; `anon` gets nothing.
--   * Nobody can change their own `role`, `company_id` or company `status`:
--     those columns are never granted to `authenticated`. They only change
--     through `security definer` RPCs (here `create_company`; later blocks add
--     admin review RPCs) or with the service role.
--   * Every `security definer` function sets `search_path = ''` and is revoked
--     from `public` and `anon`.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
-- pg_cron must live in pg_catalog; it creates the `cron` schema (used by B09).
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.company_type as enum ('shipper', 'carrier');

create type public.user_role as enum ('shipper', 'carrier', 'operator', 'admin');

-- Shared by companies (here) and documents (B03):
-- pending_review -> approved | rejected, then expired or suspended.
create type public.verification_status as enum (
  'pending_review',
  'approved',
  'rejected',
  'expired',
  'suspended'
);

-- ---------------------------------------------------------------------------
-- Generic trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  type public.company_type not null,
  legal_name text not null
    constraint companies_legal_name_length check (char_length(btrim(legal_name)) between 1 and 300),
  -- RFC: 12 characters for a persona moral, 13 for a persona física.
  rfc text not null
    constraint companies_rfc_format check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  status public.verification_status not null default 'pending_review',
  -- Reason given by the admin when rejecting or suspending (set by B03 RPCs).
  status_reason text,
  contact_name text constraint companies_contact_name_length check (char_length(contact_name) <= 200),
  contact_email text constraint companies_contact_email_length check (char_length(contact_email) <= 320),
  contact_phone text constraint companies_contact_phone_length check (char_length(contact_phone) <= 32),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.companies is 'Shipper and carrier companies. Status changes only through admin RPCs.';

create unique index companies_rfc_key on public.companies (rfc);
create index companies_status_idx on public.companies (status) where archived_at is null;

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  company_id uuid references public.companies (id) on delete restrict,
  full_name text constraint profiles_full_name_length check (char_length(full_name) <= 200),
  phone text constraint profiles_phone_length check (char_length(phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Admins are internal staff and never belong to a customer company.
  constraint profiles_admin_without_company check (role <> 'admin' or company_id is null)
);

comment on table public.profiles is 'One row per auth user. role and company_id are never writable by the user.';

create index profiles_company_id_idx on public.profiles (company_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helpers (used by RLS policies of every block)
--
-- `security definer` so policies on `profiles` can call them without
-- recursing into the same policies. They only ever read the caller's own row
-- (keyed by auth.uid()), so they cannot leak other users' data.
-- ---------------------------------------------------------------------------
create function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create function public.auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id from public.profiles p where p.id = (select auth.uid());
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

-- True when the caller belongs to a company that an admin approved and that is
-- not archived. Gate for publishing loads and making offers (B05).
create function public.is_company_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.companies c on c.id = p.company_id
    where p.id = (select auth.uid())
      and c.status = 'approved'
      and c.archived_at is null
  );
$$;

revoke all on function public.auth_role() from public, anon;
revoke all on function public.auth_company_id() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_company_approved() from public, anon;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.auth_company_id() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_company_approved() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up
--
-- raw_user_meta_data is fully controlled by whoever signs up, so only the
-- self-service roles are accepted. `admin` is never assignable here (admins are
-- promoted with the service role), and company_id is never read from metadata:
-- users join a company only through create_company or an invitation (B04).
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
begin
  if v_role is null or v_role not in ('shipper', 'carrier', 'operator') then
    raise exception 'invalid sign-up role: %', coalesce(v_role, '(missing)')
      using errcode = '22023';
  end if;

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    v_role::public.user_role,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  );

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: an approved company keeps its verified legal name.
-- Clients may fix it while the company is in review; afterwards only admins
-- (or privileged RPCs, which run as the table owner) can change it.
-- ---------------------------------------------------------------------------
create function public.companies_guard_verified_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and old.status = 'approved'
     and new.legal_name is distinct from old.legal_name
     and not public.is_admin() then
    raise exception 'legal_name of an approved company cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.companies_guard_verified_fields() from public, anon, authenticated;

create trigger companies_guard_verified_fields
before update on public.companies
for each row execute function public.companies_guard_verified_fields();

-- ---------------------------------------------------------------------------
-- RPC: create the caller's company and link it to their profile.
-- The company type follows the caller's role (shipper -> shipper company,
-- carrier -> carrier company) and starts in `pending_review`.
-- ---------------------------------------------------------------------------
create function public.create_company(
  p_legal_name text,
  p_rfc text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Lock the caller's profile so two concurrent calls cannot create two companies.
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found' using errcode = '42501';
  end if;

  if v_profile.role not in ('shipper', 'carrier') then
    raise exception 'role % cannot create a company', v_profile.role using errcode = '42501';
  end if;

  if v_profile.company_id is not null then
    raise exception 'user already belongs to a company' using errcode = '42501';
  end if;

  insert into public.companies (type, legal_name, rfc, contact_name, contact_email, contact_phone, created_by)
  values (
    v_profile.role::text::public.company_type,
    btrim(p_legal_name),
    upper(btrim(p_rfc)),
    nullif(btrim(p_contact_name), ''),
    nullif(btrim(p_contact_email), ''),
    nullif(btrim(p_contact_phone), ''),
    v_uid
  )
  returning id into v_company_id;

  update public.profiles set company_id = v_company_id where id = v_uid;

  return v_company_id;
end;
$$;

revoke all on function public.create_company(text, text, text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: anon gets nothing; authenticated only what RLS then filters.
-- (Supabase grants ALL on new public tables to anon/authenticated by default.)
-- ---------------------------------------------------------------------------
revoke all on table public.companies from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;

grant select on table public.companies to authenticated;
grant update (legal_name, contact_name, contact_email, contact_phone)
  on table public.companies to authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- No insert/delete policies: companies are created by create_company,
-- profiles by the sign-up trigger, and business rows are archived, not deleted.
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;

-- companies: members see their own company; admins see all.
create policy companies_select_own_or_admin
on public.companies
for select
to authenticated
using (
  id = (select public.auth_company_id())
  or (select public.is_admin())
);

-- companies: shipper/carrier members edit their own active company; admins any.
-- Operators cannot edit the carrier's company.
create policy companies_update_own_or_admin
on public.companies
for update
to authenticated
using (
  (
    id = (select public.auth_company_id())
    and (select public.auth_role()) in ('shipper', 'carrier')
    and archived_at is null
  )
  or (select public.is_admin())
)
with check (
  id = (select public.auth_company_id())
  or (select public.is_admin())
);

-- profiles: own profile, teammates of the same company, or admin.
create policy profiles_select_own_company_or_admin
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or company_id = (select public.auth_company_id())
  or (select public.is_admin())
);

-- profiles: each user edits their own (only full_name and phone are granted).
create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
)
with check (
  id = (select auth.uid())
  or (select public.is_admin())
);
