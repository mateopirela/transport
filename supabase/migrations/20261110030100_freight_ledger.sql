-- I3 · Freight ledger: terms, commission, Cobranza and Cartera (D08-E2,
-- D33-E1, D34-E1; plan-v1.md §I, I3).
--
-- The freight goes through the platform: Fulmis invoices the client 100 % of
-- the freight and pays the carrier the freight minus its commission. Money
-- moves by SPEI outside the app; the platform keeps the record and the admin
-- reconciles every payment.
--
--   * companies.payment_terms_days (shipper: 15, 30 or 60 days; null until
--     the admin sets it) and companies.commission_bps (carrier: an optional
--     override of freight.commission_bps). Only admins change them, through
--     admin_set_company_payment_terms and admin_set_company_commission
--     (audited by the companies trigger).
--   * platform_settings 'freight.commission_bps' (300 = 3 % by default; 0 or
--     300..500). Only admins read it (the client never learns the commission).
--   * freight_ledgers: one per trip, created by a trigger on trips (and
--     backfilled). The client amount is the agreed price; the commission is
--     frozen when the trip is created (the carrier's override, else the
--     setting); the carrier's net is the amount minus the commission
--     (freight_commission_cents, mirrored by commissionCents in
--     packages/shared/src/freight). The client's due date is the delivery
--     (delivered_at, which needs the delivery evidence) plus the terms, in
--     calendar days in Mexico City; the carrier is paid on that same date,
--     once the client paid (D33-E1). A cancelled trip cancels its ledger on
--     both sides; if it already had payments it is flagged for the admin.
--   * freight_payments: SPEI payments recorded by the admin
--     (admin_record_freight_payment, audited). Partial payments add up. The
--     SPEI reference (clave de rastreo) is unique per direction: recording the
--     same payment again returns it instead of adding it twice.
--   * process_freight_due (pg_cron, daily): the client's side becomes
--     `overdue` after its due date, and a carrier's `pending` payment becomes
--     `on_hold` ("Retenido: el cliente no ha pagado") after its due date while
--     the client has not paid (to the Gerente and the coordinators of the
--     unit). The read RPCs compute the same at read time.
--   * Reads: nobody but the admin reads the tables. The shipper reads its
--     side through shipper_freight_ledger() (amount, due date, status and its
--     own payments); the carrier staff, through carrier_freight_ledger()
--     (freight, commission, net, its date, its status and its own payments),
--     the Gerente for the whole company and a Coordinador for their business
--     units. Neither side ever gets the other's amounts (I.0.3). Admins use
--     admin_freight_ledger().
--   * Every status changes only inside these functions and triggers; clients
--     have no write privilege on the tables.
--
-- Lock order: the trip row (its RPCs hold it when the triggers here run),
-- then its ledger. admin_set_company_payment_terms locks the company, then
-- its ledgers by id. admin_record_freight_payment locks only the ledger.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.freight_client_status as enum (
  'pending', 'invoiced', 'paid', 'overdue', 'written_off', 'cancelled'
);
create type public.freight_carrier_status as enum (
  'pending', 'on_hold', 'quick_pay_requested', 'scheduled', 'paid', 'cancelled'
);
create type public.freight_payment_direction as enum ('client_to_fulmis', 'fulmis_to_carrier');

comment on type public.freight_client_status is
  'What the client owes Fulmis for a trip. Mirrors FREIGHT_CLIENT_STATUSES in @transport/shared.';
comment on type public.freight_carrier_status is
  'What Fulmis owes the carrier for a trip. Mirrors FREIGHT_CARRIER_STATUSES in @transport/shared.';

-- ---------------------------------------------------------------------------
-- Company terms and commission override
-- ---------------------------------------------------------------------------
alter table public.companies
  add column payment_terms_days smallint
    constraint companies_payment_terms_days_check check (payment_terms_days in (15, 30, 60)),
  add column commission_bps integer
    constraint companies_commission_bps_check check (commission_bps = 0 or commission_bps between 300 and 500),
  add constraint companies_payment_terms_shipper_only check (payment_terms_days is null or type = 'shipper'),
  add constraint companies_commission_carrier_only check (commission_bps is null or type = 'carrier');

comment on column public.companies.payment_terms_days is
  'Days the shipper has to pay each freight after the delivery (15, 30 or 60; D33-E1). Null: "Plazo por definir". Set by admins.';
comment on column public.companies.commission_bps is
  'Commission of Fulmis for this carrier in basis points (0 or 300..500), instead of freight.commission_bps. Set by admins.';

-- ---------------------------------------------------------------------------
-- Settings: the default commission, hidden from everyone but the admins
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('freight.commission_bps', '300',
   'Comisión de Fulmis por viaje, en puntos base (300 = 3 %). 0 (sin comisión) o de 300 a 500.')
on conflict (key) do nothing;

-- The client must never learn the commission (I.0.3), and the carrier sees
-- the one frozen in each trip: the freight settings are for the admins only.
create policy platform_settings_freight_admin_only
on public.platform_settings
as restrictive
for select
to authenticated
using (key not like 'freight.%' or (select public.is_admin()));

-- Same as I2 (20261110020000_pilot_support.sql: H3's billing keys and the
-- support keys), except it also validates freight.commission_bps.
create or replace function public.admin_set_platform_setting(p_key text, p_value jsonb)
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
    when 'support.whatsapp' then
      -- E.164 as packages/shared/src/phone.ts (E164_PATTERN); the apps build
      -- https://wa.me/<digits> from it.
      if jsonb_typeof(p_value) is distinct from 'null'
         and (jsonb_typeof(p_value) is distinct from 'string'
              or (p_value #>> '{}') !~ '^\+[1-9][0-9]{7,14}$') then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'support.hours' then
      if jsonb_typeof(p_value) = 'string' then
        -- Trimmed of any whitespace, as String.prototype.trim in the apps.
        p_value := to_jsonb(regexp_replace(p_value #>> '{}', '^\s+|\s+$', '', 'g'));
        if char_length(p_value #>> '{}') not between 1 and 200 then
          raise exception 'invalid value for %', p_key using errcode = '22023';
        end if;
      elsif jsonb_typeof(p_value) is distinct from 'null' then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'freight.commission_bps' then
      if not public.freight_is_valid_commission(p_value) then
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

-- ---------------------------------------------------------------------------
-- Pure helpers (mirrored in packages/shared/src/freight, same test cases)
-- ---------------------------------------------------------------------------

-- Whether a JSON value is a valid commission: an integer 0 or 300..500.
create function public.freight_is_valid_commission(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]{1,4}$' then
    return false;
  end if;
  return (p_value #>> '{}')::integer = 0 or (p_value #>> '{}')::integer between 300 and 500;
end;
$$;

-- The commission of an amount: amount × bps / 10 000, rounded to the cent,
-- half up. Integer arithmetic only. The carrier's net is the amount minus it.
create function public.freight_commission_cents(p_amount_cents bigint, p_bps integer)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select (p_amount_cents * p_bps + 5000) / 10000;
$$;

-- The due date: the day of the delivery in Mexico City plus the terms, in
-- calendar days. Null without a delivery or without terms.
create function public.freight_due_on(p_delivered_at timestamptz, p_terms_days smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((p_delivered_at at time zone 'America/Mexico_City')::date + p_terms_days::integer);
$$;

-- Today in Mexico City (D02).
create function public.freight_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$;

-- The client's status at read time: pending or invoiced after the due date
-- is overdue, even before the daily job marks it (mirrors
-- effectiveClientStatus).
create function public.freight_effective_client_status(
  p_status public.freight_client_status,
  p_due_on date
)
returns public.freight_client_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_status in ('pending', 'invoiced') and p_due_on < public.freight_today() then 'overdue'
    else p_status
  end::public.freight_client_status;
$$;

-- The carrier's status at read time: a pending payment after its date is
-- held while the client has not paid (a client's full payment already moved
-- it to scheduled). Only `pending` is held: a quick pay request (I4), a
-- scheduled or a paid payment never goes back (mirrors effectiveCarrierStatus).
create function public.freight_effective_carrier_status(
  p_status public.freight_carrier_status,
  p_due_on date,
  p_client_status public.freight_client_status
)
returns public.freight_carrier_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'pending' and p_due_on < public.freight_today() and p_client_status <> 'paid' then 'on_hold'
    else p_status
  end::public.freight_carrier_status;
$$;

revoke all on function public.freight_is_valid_commission(jsonb) from public, anon;
revoke all on function public.freight_commission_cents(bigint, integer) from public, anon;
revoke all on function public.freight_due_on(timestamptz, smallint) from public, anon;
revoke all on function public.freight_today() from public, anon;
revoke all on function public.freight_effective_client_status(public.freight_client_status, date) from public, anon;
revoke all on function public.freight_effective_carrier_status(
  public.freight_carrier_status, date, public.freight_client_status
) from public, anon;
grant execute on function public.freight_is_valid_commission(jsonb) to authenticated;
grant execute on function public.freight_commission_cents(bigint, integer) to authenticated;
grant execute on function public.freight_due_on(timestamptz, smallint) to authenticated;
grant execute on function public.freight_today() to authenticated;
grant execute on function public.freight_effective_client_status(public.freight_client_status, date) to authenticated;
grant execute on function public.freight_effective_carrier_status(
  public.freight_carrier_status, date, public.freight_client_status
) to authenticated;

-- The default commission (the setting, or 3 % if it is missing or malformed).
create function public.freight_default_commission_bps()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer
     from public.platform_settings s
     where s.key = 'freight.commission_bps' and public.freight_is_valid_commission(s.value)),
    300
  );
$$;

revoke all on function public.freight_default_commission_bps() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- freight_ledgers
-- ---------------------------------------------------------------------------
create table public.freight_ledgers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  client_amount_cents bigint not null
    constraint freight_ledgers_client_amount_positive check (client_amount_cents > 0),
  commission_bps integer not null
    constraint freight_ledgers_commission_bps_check check (commission_bps = 0 or commission_bps between 300 and 500),
  commission_cents bigint not null,
  carrier_net_cents bigint not null,
  client_terms_days smallint
    constraint freight_ledgers_client_terms_days_check check (client_terms_days in (15, 30, 60)),
  client_due_on date,
  client_status public.freight_client_status not null default 'pending',
  client_paid_cents bigint not null default 0,
  carrier_due_on date,
  carrier_status public.freight_carrier_status not null default 'pending',
  carrier_paid_cents bigint not null default 0,
  -- A cancelled trip that already had payments: the admin resolves it by hand
  -- (refunds are out of scope).
  needs_review boolean not null default false,
  review_note text constraint freight_ledgers_review_note_length check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freight_ledgers_trip_key unique (trip_id),
  -- The commission is computed, and the net is the rest: the parts add up.
  constraint freight_ledgers_commission_computed
    check (commission_cents = public.freight_commission_cents(client_amount_cents, commission_bps)),
  constraint freight_ledgers_parts_add_up check (commission_cents + carrier_net_cents = client_amount_cents),
  constraint freight_ledgers_client_paid_range check (client_paid_cents between 0 and client_amount_cents),
  constraint freight_ledgers_carrier_paid_range check (carrier_paid_cents between 0 and carrier_net_cents),
  constraint freight_ledgers_client_paid_full check (client_status <> 'paid' or client_paid_cents = client_amount_cents),
  constraint freight_ledgers_carrier_paid_full check (carrier_status <> 'paid' or carrier_paid_cents = carrier_net_cents),
  -- No due date and no receivable without terms ("Plazo por definir").
  constraint freight_ledgers_due_needs_terms check (client_due_on is null or client_terms_days is not null),
  constraint freight_ledgers_invoiced_needs_terms check (client_status <> 'invoiced' or client_terms_days is not null),
  -- A cancelled trip is cancelled on both sides.
  constraint freight_ledgers_cancelled_both check ((client_status = 'cancelled') = (carrier_status = 'cancelled'))
);

comment on table public.freight_ledgers is
  'What the client owes Fulmis and Fulmis owes the carrier for each trip (I3). Read by admins only; each side reads its own columns through shipper_freight_ledger and carrier_freight_ledger. Written only by the I3 functions.';

create index freight_ledgers_client_open_idx on public.freight_ledgers (client_due_on)
  where client_status in ('pending', 'invoiced');
create index freight_ledgers_carrier_open_idx on public.freight_ledgers (carrier_due_on)
  where carrier_status = 'pending';

create trigger freight_ledgers_set_updated_at
before update on public.freight_ledgers
for each row execute function public.set_updated_at();

create trigger freight_ledgers_audit_admin
after insert or update or delete on public.freight_ledgers
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- freight_payments
-- ---------------------------------------------------------------------------
create table public.freight_payments (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.freight_ledgers (id) on delete cascade,
  direction public.freight_payment_direction not null,
  amount_cents bigint not null constraint freight_payments_amount_positive check (amount_cents > 0),
  paid_on date not null,
  -- SPEI tracking key (clave de rastreo): letters and digits, up to 30.
  spei_reference text not null constraint freight_payments_spei_reference_format
    check (spei_reference ~ '^[A-Z0-9]{1,30}$'),
  note text constraint freight_payments_note_length check (char_length(note) <= 500),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.freight_payments is
  'SPEI payments of the freight recorded by the admin (I3): from the client to Fulmis or from Fulmis to the carrier. Read by admins only.';

-- Idempotency: one payment per SPEI reference and direction.
create unique index freight_payments_reference_key on public.freight_payments (direction, spei_reference);
create index freight_payments_ledger_idx on public.freight_payments (ledger_id, direction, paid_on);

create trigger freight_payments_audit_admin
after insert or update or delete on public.freight_payments
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- Privileges and RLS: only admins read the tables; nobody writes them
-- directly (the functions below are security definer).
-- ---------------------------------------------------------------------------
revoke all on table public.freight_ledgers from anon, authenticated;
revoke all on table public.freight_payments from anon, authenticated;
grant select on table public.freight_ledgers to authenticated;
grant select on table public.freight_payments to authenticated;

alter table public.freight_ledgers enable row level security;
alter table public.freight_payments enable row level security;

create policy freight_ledgers_select_admin
on public.freight_ledgers
for select
to authenticated
using ((select public.is_admin()));

create policy freight_payments_select_admin
on public.freight_payments
for select
to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- The ledger follows its trip
-- ---------------------------------------------------------------------------

-- Creates the ledger of a trip: the agreed price, the commission frozen now
-- (the carrier's override, else the setting) and the shipper's terms. A
-- cancelled trip (the backfill) gets a cancelled ledger.
create function public.freight_ledger_create(p_trip public.trips)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount bigint;
  v_bps integer;
  v_terms smallint;
  v_commission bigint;
  v_due date;
  v_cancelled boolean := p_trip.status = 'cancelled';
begin
  select coalesce(l.agreed_price_cents, o.amount_cents) into v_amount
  from public.offers o
  left join public.loads l on l.id = p_trip.load_id
  where o.id = p_trip.offer_id;
  select c.commission_bps into v_bps from public.companies c where c.id = p_trip.carrier_company_id;
  v_bps := coalesce(v_bps, public.freight_default_commission_bps());
  select c.payment_terms_days into v_terms from public.companies c where c.id = p_trip.shipper_company_id;
  v_commission := public.freight_commission_cents(v_amount, v_bps);
  v_due := public.freight_due_on(p_trip.delivered_at, v_terms);

  insert into public.freight_ledgers (
    trip_id, client_amount_cents, commission_bps, commission_cents, carrier_net_cents,
    client_terms_days, client_due_on, carrier_due_on, client_status, carrier_status
  ) values (
    p_trip.id, v_amount, v_bps, v_commission, v_amount - v_commission,
    v_terms, v_due, v_due,
    case when v_cancelled then 'cancelled' else 'pending' end::public.freight_client_status,
    case when v_cancelled then 'cancelled' else 'pending' end::public.freight_carrier_status
  )
  on conflict (trip_id) do nothing;
end;
$$;

revoke all on function public.freight_ledger_create(public.trips) from public, anon, authenticated, service_role;

-- After a trip is created: its ledger. After it is delivered: its due dates.
-- After it is cancelled: the ledger leaves the balances (flagged for the
-- admin if it already had payments).
create function public.freight_ledger_sync_trip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name is distinct from 'trips' or tg_when is distinct from 'AFTER' then
    raise exception 'freight_ledger_sync_trip runs only after a change of a trip' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    perform public.freight_ledger_create(new);
    return null;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.freight_ledgers f
    set client_status = 'cancelled',
        carrier_status = 'cancelled',
        needs_review = f.needs_review or f.client_paid_cents > 0 or f.carrier_paid_cents > 0
    where f.trip_id = new.id and f.client_status <> 'cancelled';
  elsif new.delivered_at is distinct from old.delivered_at and new.delivered_at is not null then
    update public.freight_ledgers f
    set client_due_on = public.freight_due_on(new.delivered_at, f.client_terms_days),
        carrier_due_on = public.freight_due_on(new.delivered_at, f.client_terms_days)
    where f.trip_id = new.id and f.client_status <> 'cancelled';
  end if;
  return null;
end;
$$;

revoke all on function public.freight_ledger_sync_trip() from public, anon, authenticated;

create trigger trips_freight_ledger_insert
after insert on public.trips
for each row execute function public.freight_ledger_sync_trip();

create trigger trips_freight_ledger_update
after update of status, delivered_at on public.trips
for each row execute function public.freight_ledger_sync_trip();

-- Backfill: a ledger for every existing trip (cancelled ones cancelled).
do $$
declare
  v_trip public.trips;
begin
  for v_trip in select * from public.trips order by created_at, id loop
    perform public.freight_ledger_create(v_trip);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification data: each side only gets its own amount
-- ---------------------------------------------------------------------------
create function public.freight_notification_data(p_ledger_id uuid, p_amount_cents bigint, p_extra jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ledgerId', f.id, 'tripId', t.id, 'amountCents', p_amount_cents)
         || coalesce(p_extra, '{}'::jsonb)
         || public.load_route_data(t.load_id)
  from public.freight_ledgers f
  join public.trips t on t.id = f.trip_id
  where f.id = p_ledger_id;
$$;

revoke all on function public.freight_notification_data(uuid, bigint, jsonb) from public, anon, authenticated, service_role;

-- The admins (they are notified of overdue freights).
create function public.notify_admins(p_type public.notification_type, p_data jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (user_id, type, data)
  select p.id, p_type, p_data
  from public.profiles p
  where p.role = 'admin'
    and p.id is distinct from (select auth.uid());
$$;

revoke all on function public.notify_admins(public.notification_type, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin RPCs (audited by the tables' triggers)
-- ---------------------------------------------------------------------------

-- Records a SPEI payment of a trip's freight: from the client to Fulmis or
-- from Fulmis to the carrier. Partial payments add up; a payment never goes
-- over what is still owed. The client's full payment marks its side paid and
-- schedules the carrier's payment (pending or held); the carrier's full
-- payment marks theirs paid. A cancelled trip takes no new payments.
-- Idempotent: the same SPEI reference and direction for the same trip,
-- amount and date returns the payment already recorded. Returns its id.
create function public.admin_record_freight_payment(
  p_trip_id uuid,
  p_direction public.freight_payment_direction,
  p_amount_cents bigint,
  p_paid_on date,
  p_spei_reference text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger public.freight_ledgers;
  v_trip public.trips;
  v_reference text := upper(regexp_replace(coalesce(p_spei_reference, ''), '\s', '', 'g'));
  v_note text := nullif(btrim(p_note), '');
  v_existing public.freight_payments;
  v_payment_id uuid;
  v_client boolean := p_direction = 'client_to_fulmis';
  v_owed bigint;
begin
  if not public.is_admin() then
    raise exception 'only admins record freight payments' using errcode = '42501';
  end if;
  if p_direction is null or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a direction and a positive amount are required' using errcode = '22023';
  end if;
  if v_reference !~ '^[A-Z0-9]{1,30}$' then
    raise exception 'the SPEI reference must have 1 to 30 letters and digits' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'the note is too long' using errcode = '22023';
  end if;

  select * into v_ledger from public.freight_ledgers where trip_id = p_trip_id for update;
  if not found then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  select * into v_trip from public.trips where id = p_trip_id;
  if p_paid_on is null or p_paid_on > public.freight_today()
     or p_paid_on < (v_trip.created_at at time zone 'America/Mexico_City')::date then
    raise exception 'the payment date must be between the trip creation and today' using errcode = '22023';
  end if;

  -- Same reference again: the same payment (a retry) or a mistake.
  select * into v_existing from public.freight_payments
  where direction = p_direction and spei_reference = v_reference;
  if found then
    if v_existing.ledger_id = v_ledger.id and v_existing.amount_cents = p_amount_cents
       and v_existing.paid_on = p_paid_on then
      return v_existing.id;
    end if;
    raise exception 'this SPEI reference was already recorded' using errcode = '23505';
  end if;

  if v_ledger.client_status = 'cancelled' then
    raise exception 'the trip was cancelled' using errcode = '55000';
  end if;
  if v_client then
    v_owed := v_ledger.client_amount_cents - v_ledger.client_paid_cents;
  else
    v_owed := v_ledger.carrier_net_cents - v_ledger.carrier_paid_cents;
  end if;
  if v_owed = 0 then
    raise exception 'this side is already paid' using errcode = '55000';
  end if;
  if p_amount_cents > v_owed then
    raise exception 'the payment is more than what is owed' using errcode = '22023';
  end if;

  insert into public.freight_payments (ledger_id, direction, amount_cents, paid_on, spei_reference, note, recorded_by)
  values (v_ledger.id, p_direction, p_amount_cents, p_paid_on, v_reference, v_note, (select auth.uid()))
  returning id into v_payment_id;

  if v_client then
    update public.freight_ledgers
    set client_paid_cents = client_paid_cents + p_amount_cents,
        client_status = case when p_amount_cents = v_owed then 'paid' else client_status end,
        carrier_status = case
          when p_amount_cents = v_owed and carrier_status in ('pending', 'on_hold') then 'scheduled'
          else carrier_status
        end
    where id = v_ledger.id;
    perform public.notify_company(
      v_trip.shipper_company_id, 'shipper', 'freight_payment_received',
      public.freight_notification_data(v_ledger.id, p_amount_cents,
        jsonb_build_object('direction', p_direction, 'paidOn', p_paid_on))
    );
  else
    update public.freight_ledgers
    set carrier_paid_cents = carrier_paid_cents + p_amount_cents,
        carrier_status = case when p_amount_cents = v_owed then 'paid' else carrier_status end
    where id = v_ledger.id;
    perform public.notify_carrier_staff(
      v_trip.carrier_company_id, v_trip.business_unit_id, 'freight_payment_received',
      public.freight_notification_data(v_ledger.id, p_amount_cents,
        jsonb_build_object('direction', p_direction, 'paidOn', p_paid_on))
    );
  end if;

  return v_payment_id;
end;
$$;

revoke all on function public.admin_record_freight_payment(
  uuid, public.freight_payment_direction, bigint, date, text, text
) from public, anon;
grant execute on function public.admin_record_freight_payment(
  uuid, public.freight_payment_direction, bigint, date, text, text
) to authenticated;

-- Sets (or clears) a shipper's payment terms. The trips still "Plazo por
-- definir" and pending take them, with their due dates; the others keep the
-- terms frozen in their ledger.
create function public.admin_set_company_payment_terms(p_company_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.company_type;
begin
  if not public.is_admin() then
    raise exception 'only admins set payment terms' using errcode = '42501';
  end if;
  if p_days is not null and p_days not in (15, 30, 60) then
    raise exception 'payment terms must be 15, 30 or 60 days' using errcode = '22023';
  end if;
  select c.type into v_type from public.companies c where c.id = p_company_id for update;
  if not found then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  if v_type <> 'shipper' then
    raise exception 'only shippers have payment terms' using errcode = '22023';
  end if;

  update public.companies set payment_terms_days = p_days where id = p_company_id;

  if p_days is not null then
    perform 1
    from public.freight_ledgers f
    join public.trips t on t.id = f.trip_id
    where t.shipper_company_id = p_company_id and f.client_terms_days is null and f.client_status = 'pending'
    order by f.id
    for update of f;

    update public.freight_ledgers f
    set client_terms_days = p_days,
        client_due_on = public.freight_due_on(t.delivered_at, p_days::smallint),
        carrier_due_on = public.freight_due_on(t.delivered_at, p_days::smallint)
    from public.trips t
    where t.id = f.trip_id
      and t.shipper_company_id = p_company_id
      and f.client_terms_days is null
      and f.client_status = 'pending';
  end if;
end;
$$;

revoke all on function public.admin_set_company_payment_terms(uuid, integer) from public, anon;
grant execute on function public.admin_set_company_payment_terms(uuid, integer) to authenticated;

-- Sets (or clears) a carrier's commission override. Only new trips use it:
-- every ledger keeps the commission frozen when its trip was created.
create function public.admin_set_company_commission(p_company_id uuid, p_bps integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.company_type;
begin
  if not public.is_admin() then
    raise exception 'only admins set commissions' using errcode = '42501';
  end if;
  if p_bps is not null and not (p_bps = 0 or p_bps between 300 and 500) then
    raise exception 'the commission must be 0 or between 300 and 500 basis points' using errcode = '22023';
  end if;
  select c.type into v_type from public.companies c where c.id = p_company_id for update;
  if not found then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  if v_type <> 'carrier' then
    raise exception 'only carriers have a commission' using errcode = '22023';
  end if;
  update public.companies set commission_bps = p_bps where id = p_company_id;
end;
$$;

revoke all on function public.admin_set_company_commission(uuid, integer) from public, anon;
grant execute on function public.admin_set_company_commission(uuid, integer) to authenticated;

-- Marks the manual review of a cancelled trip with payments as done.
create function public.admin_resolve_freight_review(p_trip_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_admin() then
    raise exception 'only admins resolve freight reviews' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 500 then
    raise exception 'a note of at most 500 characters is required' using errcode = '22023';
  end if;
  update public.freight_ledgers
  set needs_review = false, review_note = v_note
  where trip_id = p_trip_id and needs_review;
  if not found then
    raise exception 'no review pending for this trip' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.admin_resolve_freight_review(uuid, text) from public, anon;
grant execute on function public.admin_resolve_freight_review(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reads, one per side (columns by side; never the whole table)
-- ---------------------------------------------------------------------------

-- The client's side of the trips of the caller's shipper company (Cartera):
-- the amount, the terms, the due date, the status, what was paid and its own
-- payments. Cancelled trips are out of the balances and of the list. Never
-- the commission nor the carrier's net.
create function public.shipper_freight_ledger()
returns table (
  ledger_id uuid,
  trip_id uuid,
  load_id uuid,
  origin_city text,
  destination_city text,
  trip_status public.trip_status,
  delivered_at timestamptz,
  amount_cents bigint,
  terms_days smallint,
  due_on date,
  status public.freight_client_status,
  paid_cents bigint,
  pending_cents bigint,
  payments jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, t.id, t.load_id, l.origin_city, l.destination_city, t.status, t.delivered_at,
         f.client_amount_cents, f.client_terms_days, f.client_due_on,
         public.freight_effective_client_status(f.client_status, f.client_due_on),
         f.client_paid_cents, f.client_amount_cents - f.client_paid_cents,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'amountCents', p.amount_cents, 'paidOn', p.paid_on, 'speiReference', p.spei_reference
           ) order by p.paid_on, p.created_at)
           from public.freight_payments p
           where p.ledger_id = f.id and p.direction = 'client_to_fulmis'
         ), '[]'::jsonb)
  from public.freight_ledgers f
  join public.trips t on t.id = f.trip_id
  join public.loads l on l.id = t.load_id
  where t.shipper_company_id = public.auth_shipper_company_id()
    and f.client_status <> 'cancelled'
  order by f.client_due_on nulls last, t.created_at desc;
$$;

revoke all on function public.shipper_freight_ledger() from public, anon;
grant execute on function public.shipper_freight_ledger() to authenticated;

-- The carrier's side of the trips the caller operates (Cobranza): the whole
-- company for the Gerente, their business units for a Coordinador, nothing
-- for anyone else. The freight is its commission plus its net (the agreed
-- price the carrier already knows); its date, its status and its own
-- payments. Never the client's terms, due date, status or payments.
create function public.carrier_freight_ledger()
returns table (
  ledger_id uuid,
  trip_id uuid,
  load_id uuid,
  business_unit_id uuid,
  origin_city text,
  destination_city text,
  trip_status public.trip_status,
  delivered_at timestamptz,
  freight_cents bigint,
  commission_bps integer,
  commission_cents bigint,
  net_cents bigint,
  due_on date,
  status public.freight_carrier_status,
  paid_cents bigint,
  pending_cents bigint,
  payments jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, t.id, t.load_id, t.business_unit_id, l.origin_city, l.destination_city, t.status, t.delivered_at,
         f.commission_cents + f.carrier_net_cents, f.commission_bps, f.commission_cents, f.carrier_net_cents,
         f.carrier_due_on,
         public.freight_effective_carrier_status(f.carrier_status, f.carrier_due_on, f.client_status),
         f.carrier_paid_cents, f.carrier_net_cents - f.carrier_paid_cents,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'amountCents', p.amount_cents, 'paidOn', p.paid_on, 'speiReference', p.spei_reference
           ) order by p.paid_on, p.created_at)
           from public.freight_payments p
           where p.ledger_id = f.id and p.direction = 'fulmis_to_carrier'
         ), '[]'::jsonb)
  from public.freight_ledgers f
  join public.trips t on t.id = f.trip_id
  join public.loads l on l.id = t.load_id
  where (t.carrier_company_id = public.auth_fleet_company_id()
         or t.business_unit_id = any (public.auth_business_unit_ids()))
    and f.carrier_status <> 'cancelled'
  order by f.carrier_due_on nulls last, t.created_at desc;
$$;

revoke all on function public.carrier_freight_ledger() from public, anon;
grant execute on function public.carrier_freight_ledger() to authenticated;

-- Admin: every trip with both sides (statuses at read time), the parties,
-- the review flag and every payment.
create function public.admin_freight_ledger()
returns table (
  ledger_id uuid,
  trip_id uuid,
  load_id uuid,
  origin_city text,
  destination_city text,
  trip_status public.trip_status,
  delivered_at timestamptz,
  shipper_company_id uuid,
  shipper_name text,
  carrier_company_id uuid,
  carrier_name text,
  client_amount_cents bigint,
  commission_bps integer,
  commission_cents bigint,
  carrier_net_cents bigint,
  client_terms_days smallint,
  client_due_on date,
  client_status public.freight_client_status,
  client_paid_cents bigint,
  carrier_due_on date,
  carrier_status public.freight_carrier_status,
  carrier_paid_cents bigint,
  needs_review boolean,
  review_note text,
  payments jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins read the freight ledger' using errcode = '42501';
  end if;
  return query
  select f.id, t.id, t.load_id, l.origin_city, l.destination_city, t.status, t.delivered_at,
         t.shipper_company_id, sc.legal_name, t.carrier_company_id, cc.legal_name,
         f.client_amount_cents, f.commission_bps, f.commission_cents, f.carrier_net_cents,
         f.client_terms_days, f.client_due_on,
         public.freight_effective_client_status(f.client_status, f.client_due_on), f.client_paid_cents,
         f.carrier_due_on,
         public.freight_effective_carrier_status(f.carrier_status, f.carrier_due_on, f.client_status),
         f.carrier_paid_cents, f.needs_review, f.review_note,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'id', p.id, 'direction', p.direction, 'amountCents', p.amount_cents, 'paidOn', p.paid_on,
             'speiReference', p.spei_reference, 'note', p.note
           ) order by p.paid_on, p.created_at)
           from public.freight_payments p
           where p.ledger_id = f.id
         ), '[]'::jsonb)
  from public.freight_ledgers f
  join public.trips t on t.id = f.trip_id
  join public.loads l on l.id = t.load_id
  join public.companies sc on sc.id = t.shipper_company_id
  join public.companies cc on cc.id = t.carrier_company_id
  order by f.needs_review desc, f.client_due_on nulls last, t.created_at desc;
end;
$$;

revoke all on function public.admin_freight_ledger() from public, anon;
grant execute on function public.admin_freight_ledger() to authenticated;

-- ---------------------------------------------------------------------------
-- Cron: overdue clients and held carrier payments
-- ---------------------------------------------------------------------------

-- Marks overdue the client's side past its due date (pending or invoiced),
-- warning the admins and the shipper, and holds the carrier's pending
-- payment past its date while the client has not paid, warning the Gerente
-- (and, as every carrier notification, the coordinators of the trip's
-- business unit: notify_carrier_staff).
-- Each change happens once (the statuses move on). Returns how many sides
-- changed.
create function public.process_freight_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.freight_today();
  v_overdue uuid[];
  v_held uuid[];
  v_row record;
  v_data jsonb;
begin
  with changed as (
    update public.freight_ledgers f
    set client_status = 'overdue'
    where f.client_status in ('pending', 'invoiced') and f.client_due_on < v_today
    returning f.id
  )
  select coalesce(array_agg(id), '{}') into v_overdue from changed;

  with changed as (
    update public.freight_ledgers f
    set carrier_status = 'on_hold'
    where f.carrier_status = 'pending' and f.carrier_due_on < v_today and f.client_status <> 'paid'
    returning f.id
  )
  select coalesce(array_agg(id), '{}') into v_held from changed;

  for v_row in
    select f.id, f.client_amount_cents - f.client_paid_cents as owed, f.client_due_on, t.shipper_company_id
    from public.freight_ledgers f
    join public.trips t on t.id = f.trip_id
    where f.id = any (v_overdue)
    order by f.id
  loop
    v_data := public.freight_notification_data(v_row.id, v_row.owed, jsonb_build_object('dueOn', v_row.client_due_on));
    perform public.notify_admins('freight_overdue', v_data);
    perform public.notify_company(v_row.shipper_company_id, 'shipper', 'freight_overdue', v_data);
  end loop;

  for v_row in
    select f.id, f.carrier_net_cents - f.carrier_paid_cents as owed, f.carrier_due_on, t.carrier_company_id,
           t.business_unit_id
    from public.freight_ledgers f
    join public.trips t on t.id = f.trip_id
    where f.id = any (v_held)
    order by f.id
  loop
    perform public.notify_carrier_staff(
      v_row.carrier_company_id, v_row.business_unit_id, 'freight_on_hold',
      public.freight_notification_data(v_row.id, v_row.owed, jsonb_build_object('dueOn', v_row.carrier_due_on))
    );
  end loop;

  return cardinality(v_overdue) + cardinality(v_held);
end;
$$;

revoke all on function public.process_freight_due() from public, anon, authenticated, service_role;

-- 07:00 in Mexico City (13:00 UTC), with the other daily jobs (B09).
select cron.schedule('process-freight-due', '0 13 * * *', 'select public.process_freight_due()');
