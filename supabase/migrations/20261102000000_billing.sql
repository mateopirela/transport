-- H3 · The carrier's subscription with Stripe, in MXN (D24-E1, D30), on top
-- of G8's specification.
--
--   * platform_settings: global settings as data (no secrets), read by every
--     signed-in user, written only by admin_set_platform_setting (audited).
--     The pilot flag (billing.pilot_mode) is on by default: while it is on,
--     every carrier company is "Piloto gratis", Checkout is not opened and
--     nothing is blocked. billing.pilot_ends_at only drives the notices.
--   * subscription_plans: one plan per audience (hombre camión, empresa
--     transportista), with no price ("Por definir") until Mateo and JP set
--     it. A plan is offered only with a price, a Stripe price and active.
--     Edited by admins through admin_update_subscription_plan (audited).
--   * company_subscriptions: the Stripe state of each carrier company (a row
--     per company, created by a trigger and backfilled). Written only by the
--     *_service RPCs of the billing Edge Functions (service role).
--   * billing_events: the Stripe events already applied (idempotency). Only
--     ids and states, no personal data. Admins read it.
--   * company_billing_state(): the effective state the apps show. Its pure
--     mirror is billingState() in packages/shared/src/billing.ts.
--   * assert_billing_allows(company): the future block, off. It only refuses
--     with the pilot over, billing.enforcement = 'block' and no active
--     subscription, and it is called only by make_offer and
--     set_vehicle_availability (new work). Trips in progress, locations,
--     evidence, chat, cancellations and documents never call it.
--
-- Lock order: a billing event (its primary key), then the company's
-- subscription row. Nothing else locks these tables.

create type public.subscription_status as enum ('pilot_free', 'active', 'past_due', 'canceled', 'none');
create type public.subscription_audience as enum ('fleet', 'owner_operator');

comment on type public.subscription_status is
  'pilot_free is only effective (never stored): the pilot flag is on. none: no subscription yet.';

-- ---------------------------------------------------------------------------
-- platform_settings
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key
    constraint platform_settings_key_check check (key ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  value jsonb not null,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.platform_settings is
  'Global settings of the platform as data (no secrets). Admins change them with admin_set_platform_setting.';

create trigger platform_settings_audit_admin
after insert or update or delete on public.platform_settings
for each row execute function public.audit_admin_action();

insert into public.platform_settings (key, value, description) values
  ('billing.pilot_mode', 'true',
   'Prueba piloto: mientras esté activa, todas las empresas transportistas están en "Piloto gratis".'),
  ('billing.pilot_ends_at', 'null',
   'Fecha de fin de la prueba piloto (solo para los avisos). Vacía: sin fecha.'),
  ('billing.enforcement', '"off"',
   'Sin suscripción activa después del piloto: off (nada), notice (aviso) o block (sin ofertas ni disponibilidad nuevas).')
on conflict (key) do nothing;

revoke all on table public.platform_settings from anon, authenticated;
grant select on table public.platform_settings to authenticated;

alter table public.platform_settings enable row level security;

create policy platform_settings_select_authenticated
on public.platform_settings
for select
to authenticated
using ((select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- subscription_plans
-- ---------------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    constraint subscription_plans_code_check check (code ~ '^[a-z0-9_]{3,40}$'),
  name text not null
    constraint subscription_plans_name_check check (char_length(btrim(name)) between 1 and 80),
  description text
    constraint subscription_plans_description_check check (char_length(description) <= 500),
  audience public.subscription_audience not null,
  -- Null: "Por definir" (the plan cannot be contracted).
  amount_cents bigint
    constraint subscription_plans_amount_check check (amount_cents > 0 and amount_cents <= 100000000),
  currency text not null default 'MXN'
    constraint subscription_plans_currency_check check (currency = 'MXN'),
  billing_interval text not null default 'month'
    constraint subscription_plans_interval_check check (billing_interval in ('month', 'year')),
  -- Null: the plan cannot be contracted.
  stripe_price_id text unique
    constraint subscription_plans_stripe_price_check check (stripe_price_id ~ '^price_[A-Za-z0-9]{1,100}$'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Subscription plans by audience (D30). Without amount_cents or stripe_price_id a plan is "Por definir". Edited by admins.';

create trigger subscription_plans_set_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

create trigger subscription_plans_audit_admin
after insert or update or delete on public.subscription_plans
for each row execute function public.audit_admin_action();

insert into public.subscription_plans (code, name, description, audience, sort_order) values
  ('owner_operator_monthly', 'Hombre camión',
   'Para quien maneja su propio camión: buscar cargas, aceptar viajes y dar seguimiento.', 'owner_operator', 10),
  ('fleet_monthly', 'Empresa transportista',
   'Para empresas con Gerente, Coordinadores y flota.', 'fleet', 20)
on conflict (code) do nothing;

revoke all on table public.subscription_plans from anon, authenticated;
grant select on table public.subscription_plans to authenticated;

alter table public.subscription_plans enable row level security;

create policy subscription_plans_select
on public.subscription_plans
for select
to authenticated
using (active or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- company_subscriptions
-- ---------------------------------------------------------------------------
create table public.company_subscriptions (
  company_id uuid primary key references public.companies (id) on delete cascade,
  -- Stored state (from Stripe); pilot_free is never stored, it is effective.
  status public.subscription_status not null default 'none'
    constraint company_subscriptions_status_check check (status <> 'pilot_free'),
  plan_id uuid references public.subscription_plans (id),
  stripe_customer_id text unique
    constraint company_subscriptions_customer_check check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,100}$'),
  stripe_subscription_id text unique
    constraint company_subscriptions_subscription_check check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{1,100}$'),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- When the webhook read from Stripe the state stored here (it reads the
  -- subscription itself, not the event). A snapshot read earlier never
  -- overwrites one read later, whatever order the events arrive in.
  last_fetched_at timestamptz,
  -- The company's one outstanding Checkout session (billing-checkout reuses it
  -- while Stripe says it is open) and the short lease of a session being
  -- created, so concurrent requests never open two sessions (two
  -- subscriptions). Service only: clients cannot select these columns.
  checkout_session_id text
    constraint company_subscriptions_checkout_session_check check (checkout_session_id ~ '^cs_[A-Za-z0-9_]{1,200}$'),
  checkout_url text
    constraint company_subscriptions_checkout_url_check check (checkout_url ~ '^https://checkout\.stripe\.com/'),
  checkout_price_id text,
  checkout_expires_at timestamptz,
  checkout_lease_id uuid,
  checkout_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_subscriptions is
  'Stripe subscription of each carrier company. Written only by the billing *_service RPCs (service role).';

create index company_subscriptions_plan_idx on public.company_subscriptions (plan_id);

create trigger company_subscriptions_set_updated_at
before update on public.company_subscriptions
for each row execute function public.set_updated_at();

revoke all on table public.company_subscriptions from anon, authenticated;
-- Every column but the outstanding Checkout session (a Coordinador must never
-- get the payment page the Gerente opens).
grant select (
  company_id, status, plan_id, stripe_customer_id, stripe_subscription_id, current_period_end,
  cancel_at_period_end, last_fetched_at, created_at, updated_at
) on table public.company_subscriptions to authenticated;

alter table public.company_subscriptions enable row level security;

-- The staff of the company (Gerente and Coordinadores) and admins.
create policy company_subscriptions_select
on public.company_subscriptions
for select
to authenticated
using (
  company_id = (select public.auth_carrier_company_id())
  or (select public.is_admin())
);

-- A row for each carrier company, now and for every new one.
create function public.companies_create_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'carrier' then
    insert into public.company_subscriptions (company_id) values (new.id)
    on conflict (company_id) do nothing;
  end if;
  return null;
end;
$$;

revoke all on function public.companies_create_subscription() from public, anon, authenticated;

create trigger companies_create_subscription
after insert or update of type on public.companies
for each row execute function public.companies_create_subscription();

insert into public.company_subscriptions (company_id)
select c.id from public.companies c where c.type = 'carrier'
on conflict (company_id) do nothing;

-- ---------------------------------------------------------------------------
-- billing_events
-- ---------------------------------------------------------------------------
create table public.billing_events (
  stripe_event_id text primary key
    constraint billing_events_id_check check (stripe_event_id ~ '^evt_[A-Za-z0-9]{1,100}$'),
  type text not null
    constraint billing_events_type_check check (char_length(type) between 1 and 100),
  company_id uuid references public.companies (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  -- Only ids and states, never personal data.
  summary jsonb not null default '{}'
);

comment on table public.billing_events is
  'Stripe events already applied (idempotency of the webhook). Written only by billing_apply_event_service.';

create index billing_events_company_idx on public.billing_events (company_id, received_at desc);

revoke all on table public.billing_events from anon, authenticated;
grant select on table public.billing_events to authenticated;

alter table public.billing_events enable row level security;

create policy billing_events_select_admin
on public.billing_events
for select
to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients; the RPCs below run them as
-- their owner). A missing or malformed setting falls back to the pilot: free
-- and nothing blocked.
-- ---------------------------------------------------------------------------
create function public.billing_settings(
  out pilot_mode boolean,
  out pilot_ends_at timestamptz,
  out enforcement text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pilot jsonb;
  v_ends jsonb;
  v_enforcement jsonb;
begin
  select s.value into v_pilot from public.platform_settings s where s.key = 'billing.pilot_mode';
  select s.value into v_ends from public.platform_settings s where s.key = 'billing.pilot_ends_at';
  select s.value into v_enforcement from public.platform_settings s where s.key = 'billing.enforcement';
  pilot_mode := case when jsonb_typeof(v_pilot) = 'boolean' then (v_pilot)::boolean else true end;
  pilot_ends_at := case when jsonb_typeof(v_ends) = 'string' then (v_ends #>> '{}')::timestamptz end;
  enforcement := case
    when jsonb_typeof(v_enforcement) = 'string' and (v_enforcement #>> '{}') in ('off', 'notice', 'block')
      then v_enforcement #>> '{}'
    else 'off'
  end;
end;
$$;

revoke all on function public.billing_settings() from public, anon, authenticated, service_role;

-- Stripe subscription status → stored status (G8).
create function public.billing_map_stripe_status(p_status text)
returns public.subscription_status
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'active' then 'active'::public.subscription_status
    when 'trialing' then 'active'
    when 'past_due' then 'past_due'
    when 'unpaid' then 'past_due'
    when 'incomplete' then 'past_due'
    when 'paused' then 'past_due'
    when 'canceled' then 'canceled'
    when 'incomplete_expired' then 'canceled'
  end;
$$;

revoke all on function public.billing_map_stripe_status(text) from public, anon, authenticated, service_role;

-- The plan a company would contract: its own, or the active one of its
-- audience (hombre camión or empresa transportista).
create function public.billing_company_plan_id(p_company_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s.plan_id from public.company_subscriptions s where s.company_id = p_company_id),
    (select p.id
     from public.subscription_plans p
     join public.companies c on c.id = p_company_id
     where p.active
       and p.audience = case when c.is_owner_operator then 'owner_operator'::public.subscription_audience
                             else 'fleet'::public.subscription_audience end
     order by p.sort_order, p.code
     limit 1)
  );
$$;

revoke all on function public.billing_company_plan_id(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The future block (D30), off. Only make_offer and set_vehicle_availability
-- call it. Invoker rights: its callers are security definer RPCs.
-- ---------------------------------------------------------------------------
create function public.assert_billing_allows(p_company_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_settings record;
begin
  select * into v_settings from public.billing_settings();
  if v_settings.pilot_mode or v_settings.enforcement <> 'block' then
    return;
  end if;
  if not exists (
    select 1 from public.company_subscriptions s
    where s.company_id = p_company_id and s.status = 'active'
  ) then
    raise exception 'subscription required' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_billing_allows(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: the effective billing state of a carrier company. Without an argument,
-- the caller's (Gerente or Coordinador); admins may pass any company.
--   effective_status: pilot_free while the pilot flag is on; otherwise the
--     stored status (active, past_due, canceled or none).
--   notice: pilot, pilot_ending (the end is 14 days away or less), inactive
--     (pilot over, no active subscription and enforcement notice or block)
--     or none.
--   checkout_available: only for the Gerente, with the pilot over, the plan
--     offered and no subscription in force.
--   billing_configured: some active plan has a Stripe price.
-- ---------------------------------------------------------------------------
create function public.company_billing_state(p_company_id uuid default null)
returns table (
  company_id uuid,
  effective_status public.subscription_status,
  stored_status public.subscription_status,
  plan_code text,
  plan_name text,
  plan_amount_cents bigint,
  plan_interval text,
  pilot_mode boolean,
  pilot_ends_at timestamptz,
  enforcement text,
  notice text,
  checkout_available boolean,
  billing_configured boolean,
  has_customer boolean,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_own uuid := public.auth_carrier_company_id();
  v_company uuid := coalesce(p_company_id, v_own);
  v_settings record;
  v_sub public.company_subscriptions;
  v_plan public.subscription_plans;
  v_status public.subscription_status;
  v_offered boolean;
begin
  if v_company is null
     or (v_company is distinct from v_own and not public.is_admin()) then
    raise exception 'company not found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = v_company and c.type = 'carrier') then
    raise exception 'company not found' using errcode = '42501';
  end if;

  select * into v_settings from public.billing_settings();
  select * into v_sub from public.company_subscriptions s where s.company_id = v_company;
  select * into v_plan from public.subscription_plans p where p.id = public.billing_company_plan_id(v_company);
  v_status := coalesce(v_sub.status, 'none');
  v_offered := v_plan.active and v_plan.amount_cents is not null and v_plan.stripe_price_id is not null;

  company_id := v_company;
  stored_status := v_status;
  effective_status := case when v_settings.pilot_mode then 'pilot_free'::public.subscription_status else v_status end;
  plan_code := v_plan.code;
  plan_name := v_plan.name;
  plan_amount_cents := v_plan.amount_cents;
  plan_interval := v_plan.billing_interval;
  pilot_mode := v_settings.pilot_mode;
  pilot_ends_at := v_settings.pilot_ends_at;
  enforcement := v_settings.enforcement;
  notice := case
    when v_settings.pilot_mode and v_settings.pilot_ends_at is not null
         and v_settings.pilot_ends_at <= now() + interval '14 days' then 'pilot_ending'
    when v_settings.pilot_mode then 'pilot'
    when v_status = 'active' or v_settings.enforcement = 'off' then 'none'
    else 'inactive'
  end;
  checkout_available := coalesce(
    not v_settings.pilot_mode
      and v_offered
      and v_status in ('none', 'canceled')
      and v_company = public.auth_fleet_company_id(),
    false
  );
  billing_configured := exists (
    select 1 from public.subscription_plans p where p.active and p.stripe_price_id is not null
  );
  has_customer := v_sub.stripe_customer_id is not null;
  current_period_end := v_sub.current_period_end;
  cancel_at_period_end := coalesce(v_sub.cancel_at_period_end, false);
  return next;
end;
$$;

revoke all on function public.company_billing_state(uuid) from public, anon;
grant execute on function public.company_billing_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs (audited by the tables' triggers)
-- ---------------------------------------------------------------------------
create function public.admin_set_platform_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change platform settings' using errcode = '42501';
  end if;
  -- PostgREST sends a JSON null argument as SQL NULL: both mean JSON null.
  p_value := coalesce(p_value, 'null'::jsonb);
  case p_key
    when 'billing.pilot_mode' then
      if jsonb_typeof(p_value) is distinct from 'boolean' then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'billing.pilot_ends_at' then
      if jsonb_typeof(p_value) is distinct from 'null' and jsonb_typeof(p_value) is distinct from 'string' then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
      if jsonb_typeof(p_value) = 'string' then
        begin
          perform (p_value #>> '{}')::timestamptz;
        exception when others then
          raise exception 'invalid value for %', p_key using errcode = '22023';
        end;
      end if;
    when 'billing.enforcement' then
      if jsonb_typeof(p_value) is distinct from 'string' or (p_value #>> '{}') not in ('off', 'notice', 'block') then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    else
      raise exception 'unknown setting' using errcode = '22023';
  end case;

  update public.platform_settings
  set value = p_value, updated_by = (select auth.uid()), updated_at = now()
  where key = p_key;
  if not found then
    insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, (select auth.uid()));
  end if;
end;
$$;

revoke all on function public.admin_set_platform_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_platform_setting(text, jsonb) to authenticated;

create function public.admin_update_subscription_plan(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_amount_cents bigint,
  p_stripe_price_id text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can edit plans' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'p_active is required' using errcode = '22023';
  end if;
  update public.subscription_plans
  set name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      amount_cents = p_amount_cents,
      stripe_price_id = nullif(btrim(p_stripe_price_id), ''),
      active = p_active
  where id = p_plan_id;
  if not found then
    raise exception 'plan not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.admin_update_subscription_plan(uuid, text, text, bigint, text, boolean) from public, anon;
grant execute on function public.admin_update_subscription_plan(uuid, text, text, bigint, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Service RPCs (Edge Functions billing-checkout, billing-portal and
-- stripe-webhook). Only the service role; each checks the JWT role too.
-- ---------------------------------------------------------------------------

-- Who may open Checkout (with a plan) or the Customer Portal (without one):
-- only the Gerente of an active carrier company, taken from their user id.
-- Checkout also needs the pilot over, the plan offered to the company and no
-- subscription in force.
create function public.billing_session_context_service(p_user_id uuid, p_plan_code text default null)
returns table (company_id uuid, stripe_customer_id text, stripe_price_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_company uuid;
  v_settings record;
  v_sub public.company_subscriptions;
  v_plan public.subscription_plans;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select c.id into v_company
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = p_user_id and p.role = 'manager' and c.type = 'carrier' and c.archived_at is null;
  if v_company is null then
    raise exception 'only the manager can manage the subscription' using errcode = '42501';
  end if;
  select * into v_sub from public.company_subscriptions s where s.company_id = v_company;

  if p_plan_code is not null then
    select * into v_settings from public.billing_settings();
    if v_settings.pilot_mode then
      raise exception 'pilot active' using errcode = '55000';
    end if;
    if coalesce(v_sub.status, 'none') not in ('none', 'canceled') then
      raise exception 'subscription already in force' using errcode = '55000';
    end if;
    select * into v_plan from public.subscription_plans p
    where p.code = p_plan_code
      and p.active
      and p.amount_cents is not null
      and p.stripe_price_id is not null
      and p.audience = (
        select case when c.is_owner_operator then 'owner_operator'::public.subscription_audience
                    else 'fleet'::public.subscription_audience end
        from public.companies c where c.id = v_company
      );
    if not found then
      raise exception 'plan not available' using errcode = '22023';
    end if;
  end if;

  company_id := v_company;
  stripe_customer_id := v_sub.stripe_customer_id;
  stripe_price_id := v_plan.stripe_price_id;
  return next;
end;
$$;

revoke all on function public.billing_session_context_service(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_session_context_service(uuid, text) to service_role;

-- Links the company's Stripe customer the first time; afterwards returns the
-- one already linked (two concurrent Checkouts end with a single customer).
create function public.billing_link_customer_service(p_company_id uuid, p_customer_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.company_subscriptions;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_sub from public.company_subscriptions s where s.company_id = p_company_id for update;
  if not found then
    raise exception 'company not found' using errcode = '22023';
  end if;
  if v_sub.stripe_customer_id is null then
    update public.company_subscriptions set stripe_customer_id = p_customer_id where company_id = p_company_id;
    return p_customer_id;
  end if;
  return v_sub.stripe_customer_id;
end;
$$;

revoke all on function public.billing_link_customer_service(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_link_customer_service(uuid, text) to service_role;

-- One Checkout session per company at a time. Under the row lock:
--   reuse  – the stored session for this price has 5 more minutes; the
--            Edge Function still asks Stripe whether it is open and, if it
--            is not (paid or expired), calls again with p_discard_session_id
--            to drop it;
--   busy   – another request holds the lease and is creating one;
--   create – this request takes a 60-second lease (its id is the Stripe
--            idempotency key) and must save the session with
--            billing_save_checkout_service. session_id is then the session
--            it replaces (if any), which the Edge Function expires in Stripe
--            before creating the new one, so two payable sessions never
--            overlap.
create function public.billing_begin_checkout_service(
  p_company_id uuid,
  p_price_id text,
  p_discard_session_id text default null
)
returns table (action text, session_id text, url text, lease_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_sub public.company_subscriptions;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_sub from public.company_subscriptions s where s.company_id = p_company_id for update;
  if not found then
    raise exception 'company not found' using errcode = '22023';
  end if;
  if v_sub.checkout_session_id is not null
     and v_sub.checkout_session_id is distinct from p_discard_session_id
     and v_sub.checkout_price_id = p_price_id
     and v_sub.checkout_expires_at > now() + interval '5 minutes' then
    action := 'reuse';
    session_id := v_sub.checkout_session_id;
    url := v_sub.checkout_url;
  elsif v_sub.checkout_lease_until > now() then
    action := 'busy';
  else
    action := 'create';
    session_id := v_sub.checkout_session_id;
    lease_id := gen_random_uuid();
    update public.company_subscriptions
    set checkout_session_id = null,
        checkout_url = null,
        checkout_price_id = null,
        checkout_expires_at = null,
        checkout_lease_id = lease_id,
        checkout_lease_until = now() + interval '60 seconds'
    where company_id = p_company_id;
  end if;
  return next;
end;
$$;

revoke all on function public.billing_begin_checkout_service(uuid, text, text) from public, anon, authenticated;
grant execute on function public.billing_begin_checkout_service(uuid, text, text) to service_role;

-- Saves the session created under a lease. Only the holder of the lease
-- saves (a late request whose lease was taken over changes nothing).
create function public.billing_save_checkout_service(
  p_company_id uuid,
  p_lease_id uuid,
  p_price_id text,
  p_session_id text,
  p_url text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.company_subscriptions
  set checkout_session_id = p_session_id,
      checkout_url = p_url,
      checkout_price_id = p_price_id,
      checkout_expires_at = p_expires_at,
      checkout_lease_id = null,
      checkout_lease_until = null
  where company_id = p_company_id and checkout_lease_id = p_lease_id;
  return found;
end;
$$;

revoke all on function public.billing_save_checkout_service(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_save_checkout_service(uuid, uuid, text, text, text, timestamptz) to service_role;

-- Applies the customer's current subscription, as the webhook read it from
-- Stripe for one event (never the subscription the event names: a delayed
-- event of an old subscription reads the current one too). Idempotent: an
-- event already applied answers 'duplicate' and changes nothing. The company is the one linked to the customer (never
-- metadata from the event). Snapshots are ordered by p_fetched_at, the time
-- the webhook started reading the subscription from Stripe: one read before
-- the stored one is stale, so two webhooks that race (one reads "active",
-- the other later reads "canceled" and writes first) never bring back the
-- older state. On top of that, a canceled subscription never comes back:
-- Stripe cannot reactivate it. Answers:
--   applied | duplicate | stale (an older snapshot, or a canceled
--   subscription seen alive again) | unknown_customer.
create function public.billing_apply_event_service(
  p_event_id text,
  p_event_type text,
  p_fetched_at timestamptz,
  p_customer_id text,
  p_subscription_id text,
  p_stripe_status text,
  p_price_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.company_subscriptions;
  v_status public.subscription_status := public.billing_map_stripe_status(p_stripe_status);
  v_plan_id uuid;
  v_result text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if v_status is null then
    raise exception 'unknown subscription status' using errcode = '22023';
  end if;
  if p_fetched_at is null or p_subscription_id is null then
    raise exception 'fetch time and subscription are required' using errcode = '22023';
  end if;

  insert into public.billing_events (stripe_event_id, type)
  values (p_event_id, p_event_type)
  on conflict (stripe_event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  select * into v_sub from public.company_subscriptions s where s.stripe_customer_id = p_customer_id for update;
  if not found then
    v_result := 'unknown_customer';
  elsif v_sub.last_fetched_at >= p_fetched_at
     or (v_sub.stripe_subscription_id = p_subscription_id
         and v_sub.status = 'canceled'
         and v_status <> 'canceled') then
    v_result := 'stale';
  else
    select p.id into v_plan_id from public.subscription_plans p where p.stripe_price_id = p_price_id;
    update public.company_subscriptions
    set status = v_status,
        plan_id = coalesce(v_plan_id, plan_id),
        stripe_subscription_id = p_subscription_id,
        current_period_end = p_current_period_end,
        cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
        last_fetched_at = p_fetched_at,
        -- A subscription in force closes the outstanding Checkout session.
        checkout_session_id = case when v_status in ('active', 'past_due') then null else checkout_session_id end,
        checkout_url = case when v_status in ('active', 'past_due') then null else checkout_url end,
        checkout_expires_at = case when v_status in ('active', 'past_due') then null else checkout_expires_at end
    where company_id = v_sub.company_id;
    v_result := 'applied';
  end if;

  update public.billing_events
  set processed_at = now(),
      company_id = v_sub.company_id,
      summary = jsonb_build_object(
        'result', v_result,
        'subscription', p_subscription_id,
        'stripe_status', p_stripe_status,
        'status', v_status
      )
  where stripe_event_id = p_event_id;
  return v_result;
end;
$$;

revoke all on function public.billing_apply_event_service(text, text, timestamptz, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.billing_apply_event_service(text, text, timestamptz, text, text, text, text, timestamptz, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- New work goes through the (off) block. Signatures and grants unchanged.
-- ---------------------------------------------------------------------------

-- Same as G1a.2 (20261026020200_business_unit_rpcs.sql), except it calls
-- assert_billing_allows for the carrier company first.
create or replace function public.make_offer(
  p_load_id uuid,
  p_amount_cents bigint,
  p_conditions text default null,
  p_vehicle_id uuid default null,
  p_business_unit_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_carrier_id uuid := public.auth_carrier_company_id();
  v_units uuid[] := public.auth_business_unit_ids();
  v_unit_id uuid := p_business_unit_id;
  v_load public.loads;
  v_negotiation public.negotiations;
  v_negotiation_id uuid;
  v_offer_id uuid;
  v_conditions text := nullif(btrim(p_conditions), '');
begin
  if v_carrier_id is null then
    raise exception 'only carriers can make offers' using errcode = '42501';
  end if;
  if not public.is_company_approved() then
    raise exception 'company is not approved' using errcode = '42501';
  end if;
  -- H3: the future block (off unless the pilot is over and enforcement is
  -- 'block'). Before any lock: it only reads settings and the subscription.
  perform public.assert_billing_allows(v_carrier_id);

  -- Authorize before locking: a carrier may only touch loads that are open or
  -- that it already negotiated, so it can never lock other shippers' drafts.
  -- The status is only revealed to carriers that negotiated the load.
  if not exists (
    select 1 from public.loads l
    where l.id = p_load_id
      and l.archived_at is null
      and (
        l.status in ('published', 'negotiating')
        or exists (
          select 1 from public.negotiations n
          where n.load_id = l.id and n.carrier_company_id = v_carrier_id and public.can_operate_unit(n.business_unit_id)
        )
      )
  ) then
    raise exception 'load not found' using errcode = '42501';
  end if;

  -- Lock order: load, then offers (shared by every RPC of this file). The
  -- status is re-read under the lock (it may have changed while waiting).
  select * into v_load from public.loads where id = p_load_id for update;

  -- Under the load lock, so the company's negotiation cannot appear meanwhile.
  select * into v_negotiation from public.negotiations n
  where n.load_id = v_load.id and n.carrier_company_id = v_carrier_id;

  if v_load.status not in ('published', 'negotiating') then
    if v_negotiation.id is null or not public.can_operate_unit(v_negotiation.business_unit_id) then
      raise exception 'load not found' using errcode = '42501';
    end if;
    raise exception 'cannot offer on a load in status %', v_load.status using errcode = '55000';
  end if;
  if v_load.pickup_window_end <= clock_timestamp() then
    raise exception 'pickup window already ended' using errcode = '55000';
  end if;
  -- Re-checked under the load lock: the carrier may have been suspended while
  -- this call waited for it.
  if not public.lock_company_approved(v_carrier_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  perform public.check_offer_fields(v_carrier_id, 'carrier', p_amount_cents, v_conditions, p_vehicle_id);

  if v_negotiation.id is not null then
    if not public.can_operate_unit(v_negotiation.business_unit_id)
       or (v_unit_id is not null and v_unit_id <> v_negotiation.business_unit_id) then
      raise exception 'another business unit of the company already negotiates this load' using errcode = '23505';
    end if;
    v_unit_id := v_negotiation.business_unit_id;
  else
    if v_unit_id is null and p_vehicle_id is not null then
      select v.business_unit_id into v_unit_id from public.vehicles v where v.id = p_vehicle_id;
    end if;
    if v_unit_id is null and cardinality(v_units) = 1 then
      v_unit_id := v_units[1];
    end if;
    if v_unit_id is null then
      raise exception 'business_unit_id is required' using errcode = '22023';
    end if;
    if not public.can_operate_unit(v_unit_id) then
      raise exception 'business unit not found' using errcode = '42501';
    end if;
  end if;
  perform public.assert_vehicle_in_unit(p_vehicle_id, v_unit_id);

  insert into public.negotiations (load_id, shipper_company_id, carrier_company_id, business_unit_id, created_by)
  values (v_load.id, v_load.shipper_company_id, v_carrier_id, v_unit_id, v_uid)
  on conflict (load_id, carrier_company_id) do update set updated_at = now()
  returning id into v_negotiation_id;

  if exists (select 1 from public.offers where negotiation_id = v_negotiation_id and status = 'pending') then
    raise exception 'negotiation already has a pending offer' using errcode = '55000';
  end if;

  insert into public.offers (
    negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents, conditions, vehicle_id, created_by
  ) values (
    v_negotiation_id, v_load.id, v_load.shipper_company_id, v_carrier_id, 'carrier', p_amount_cents, v_conditions,
    p_vehicle_id, v_uid
  )
  returning id into v_offer_id;

  perform public.sync_load_negotiation_status(v_load.id);
  return v_offer_id;
end;
$$;

revoke all on function public.make_offer(uuid, bigint, text, uuid, uuid) from public, anon;
grant execute on function public.make_offer(uuid, bigint, text, uuid, uuid) to authenticated;

-- Same as G5 (20261030000100_vehicle_release.sql), except it calls
-- assert_billing_allows for the unit's company after authorizing the caller.
create or replace function public.set_vehicle_availability(p_vehicle_id uuid, p_available_from timestamp with time zone, p_latitude double precision, p_longitude double precision, p_city text, p_state text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_expired text;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Lock the vehicle so concurrent calls serialize on it.
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or not public.can_operate_unit(v_vehicle.business_unit_id) then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;
  if v_vehicle.archived_at is not null then
    raise exception 'vehicle is archived' using errcode = '22023';
  end if;
  if public.vehicle_pending_release(v_vehicle.id) then
    raise exception 'vehicle is pending release' using errcode = '55000';
  end if;
  -- H3: the future block, on the unit's company (checked after the caller).
  perform public.assert_billing_allows(v_vehicle.company_id);
  if p_available_from is null then
    raise exception 'p_available_from is required' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  -- Ownership was checked above, so reading the documents as definer is safe.
  select string_agg(e.code, ', ' order by e.sort_order, e.code) into v_expired
  from public.vehicle_expired_requirements(v_vehicle.id) e;
  if v_expired is not null then
    raise exception 'vehicle has expired documents: %', v_expired using errcode = '55000';
  end if;

  update public.vehicle_availability
  set archived_at = now()
  where vehicle_id = v_vehicle.id and archived_at is null;

  insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source, created_by)
  values (
    v_vehicle.company_id,
    v_vehicle.id,
    p_available_from,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    btrim(p_city),
    btrim(p_state),
    'manual',
    (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;
