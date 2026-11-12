-- R5 · Access security (D46, docs/plan-registro.md §R5).
--
--   * is_admin() also requires the second factor: the JWT's `aal` claim must
--     be `aal2` (TOTP of Supabase Auth). Every RLS policy and RPC that asks
--     is_admin() — all of them only grant something to admins when it is
--     true, none opens anything when it is false (docs/seguridad.md, R5) —
--     now needs a session confirmed with the authenticator app, without
--     touching them one by one. An admin who only typed the password (aal1)
--     is treated like any account without a company: nothing of the admin.
--   * Temporary lock per account after repeated failures: the Password
--     Verification Attempt and MFA Verification Attempt hooks of Supabase
--     Auth call hook_password_verification_attempt and
--     hook_mfa_verification_attempt, which count the failures of each user
--     in auth_attempt_lockouts. After LOCKOUT_MAX_FAILURES (5) failures in a
--     row within LOCKOUT_WINDOW (15 min) the account is refused for
--     LOCKOUT_DURATION (15 min), even with the right password or code; a
--     success before that resets the count. The values match LOGIN_LOCKOUT
--     in packages/shared/src/auth-security.ts. The lock is temporary and
--     signs nobody out, so locking someone else's account on purpose only
--     delays their sign-in. No client role can read or write the counters
--     and there is no anonymous RPC to count failures (it would let anyone
--     lock accounts and learn which emails exist).
--
-- The hooks run only where Auth has them enabled: supabase/config.toml
-- locally and in CI; in production it is a step for Mateo (Team or
-- Enterprise plan, docs/seguridad.md). Without them the table stays empty.

-- ---------------------------------------------------------------------------
-- is_admin(): Same as B01 (20261015040644_identity.sql), except it also
-- requires the second factor (aal2) in the caller's JWT.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'admin'
     );
$$;

comment on function public.is_admin() is
  'True for an admin whose session passed the second factor (aal2, D46). Every admin policy and RPC asks it.';

-- ---------------------------------------------------------------------------
-- Failed attempts per account (no client access)
-- ---------------------------------------------------------------------------
create table public.auth_attempt_lockouts (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `password`: the password of the sign-in; `mfa`: the code of the authenticator app.
  kind text not null check (kind in ('password', 'mfa')),
  -- Failures in a row inside the current window (reset by a success or a lock).
  failed_count integer not null default 0 check (failed_count >= 0),
  -- When the first failure of the current window happened.
  window_started_at timestamptz,
  -- Refused until then, right password or not.
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

comment on table public.auth_attempt_lockouts is
  'Failed sign-in and second-factor attempts per account (R5, D46). Written only by the Auth hooks; no client access.';

alter table public.auth_attempt_lockouts enable row level security;
revoke all on table public.auth_attempt_lockouts from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The decision (internal: only the hooks and the database owner run it)
--
-- Returns the hook answer for one attempt of p_user. p_now is the clock, a
-- parameter so pgTAP can move it. One row per user and kind, locked for the
-- update, so two attempts at the same time count twice and never lose one.
-- ---------------------------------------------------------------------------
create function public.auth_attempt_decision(
  p_kind text,
  p_user uuid,
  p_valid boolean,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  -- LOGIN_LOCKOUT (packages/shared/src/auth-security.ts).
  c_max_failures constant integer := 5;
  c_window constant interval := interval '15 minutes';
  c_lock constant interval := interval '15 minutes';
  -- Fixed English text: the web and the app recognize it and show their own copy.
  c_locked constant jsonb := jsonb_build_object(
    'decision', 'reject',
    'message', 'Too many failed attempts: account temporarily locked'
  );
  v_row public.auth_attempt_lockouts;
  v_count integer;
begin
  if p_kind not in ('password', 'mfa') or p_user is null or p_valid is null then
    raise exception 'invalid attempt' using errcode = '22023';
  end if;

  insert into public.auth_attempt_lockouts (user_id, kind)
  values (p_user, p_kind)
  on conflict (user_id, kind) do nothing;

  select * into v_row
  from public.auth_attempt_lockouts
  where user_id = p_user and kind = p_kind
  for update;

  -- Locked: refused whatever was typed, and the lock is not extended (so
  -- whoever locks an account on purpose cannot keep it locked longer).
  if v_row.locked_until is not null and v_row.locked_until > p_now then
    return c_locked;
  end if;

  if p_valid then
    update public.auth_attempt_lockouts
    set failed_count = 0, window_started_at = null, locked_until = null, updated_at = p_now
    where user_id = p_user and kind = p_kind;
    return jsonb_build_object('decision', 'continue');
  end if;

  -- A failure: a new window when there is none or it ran out.
  if v_row.window_started_at is null or v_row.window_started_at <= p_now - c_window then
    v_count := 1;
    v_row.window_started_at := p_now;
  else
    v_count := v_row.failed_count + 1;
  end if;

  if v_count >= c_max_failures then
    update public.auth_attempt_lockouts
    set failed_count = 0, window_started_at = null, locked_until = p_now + c_lock, updated_at = p_now
    where user_id = p_user and kind = p_kind;
    return c_locked;
  end if;

  update public.auth_attempt_lockouts
  set failed_count = v_count, window_started_at = v_row.window_started_at, locked_until = null, updated_at = p_now
  where user_id = p_user and kind = p_kind;
  -- Auth itself answers "invalid credentials" (or "invalid code").
  return jsonb_build_object('decision', 'continue');
end;
$$;

revoke all on function public.auth_attempt_decision(text, uuid, boolean, timestamptz)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The Auth hooks (supabase_auth_admin only)
-- ---------------------------------------------------------------------------

-- Password Verification Attempt hook: event {user_id, valid}. A lock never
-- signs the user out of their open sessions (should_logout_user = false).
create function public.hook_password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.auth_attempt_decision(
    'password', (event ->> 'user_id')::uuid, (event ->> 'valid')::boolean
  ) || jsonb_build_object('should_logout_user', false);
end;
$$;

-- MFA Verification Attempt hook: event {factor_id, factor_type, user_id, valid}.
create function public.hook_mfa_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.auth_attempt_decision('mfa', (event ->> 'user_id')::uuid, (event ->> 'valid')::boolean);
end;
$$;

revoke all on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hook_mfa_verification_attempt(jsonb) from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
grant execute on function public.hook_mfa_verification_attempt(jsonb) to supabase_auth_admin;
