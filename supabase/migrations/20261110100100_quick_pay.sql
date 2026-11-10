-- I4 · Quick pay (D38; plan-v1.md §I, I4).
--
-- After the delivery with its evidence, the carrier may ask Fulmis to pay
-- before the client's terms: it gets its net minus a quick pay fee (2.5 % by
-- default, "o más"). Fulmis finances it and takes the risk of the client
-- paying late or not at all; what the client owes does not change. In V1 the
-- admin approves each request, with a configurable total exposure limit, and
-- records the SPEI payment as any other (I3).
--
--   * Settings freight.quick_pay_fee_bps (250 = 2.5 %; 250 or more, under
--     100 %) and freight.quick_pay_exposure_limit_cents (null: no automatic
--     limit). Admins only, as every freight.* setting (I3's restrictive
--     policy); the carrier staff read the current fee through
--     carrier_quick_pay_fee_bps().
--   * freight_ledgers gets the quick pay of its trip: the fee frozen when it
--     is requested (quick_pay_fee_bps, quick_pay_fee_cents: the net × the fee,
--     with freight_commission_cents, the one rounding of I.0.1), who asked and
--     when, its approval or its rejection with the reason. Once approved, the
--     carrier is owed its net minus the fee.
--   * request_quick_pay(trip, fee): the Gerente of the trip's carrier or a
--     Coordinador of its business unit. Only for a delivered trip (the
--     delivery event needs the minimum delivery photos and the receiver's
--     name, B23: the signed evidence), with the carrier's CFDI to Fulmis
--     registered (I5) and its side `pending` or `on_hold` with nothing paid
--     yet. The caller sends the fee it was shown: if the setting changed
--     meanwhile, nothing is requested. The side becomes `quick_pay_requested`
--     and the admins are told.
--   * admin_approve_quick_pay / admin_reject_quick_pay: approving schedules
--     the payment (`scheduled`); if the exposure (the quick nets approved and
--     not yet collected from the client) goes over the limit, the admin must
--     confirm. Rejecting needs a reason and puts the side back where it was
--     (`pending`, `on_hold` past its date, or `scheduled` if the client paid).
--   * admin_record_freight_payment (I3): the carrier is owed the quick net
--     once approved; no payment to the carrier while a request is pending;
--     a client's full payment withdraws a pending request (the carrier gets
--     its whole net on the regular schedule).
--   * The client never learns of any of it (I.0.3): shipper_freight_ledger
--     does not change and no notification goes to the shipper.
--
-- Lock order: the trip (shared), then its ledger, as I3 and I5. The approval
-- takes a transaction advisory lock first (the exposure is a sum over every
-- ledger: two approvals never pass the limit together), then the ledger.

-- ---------------------------------------------------------------------------
-- Settings (admins only: freight.* is hidden from everyone else by I3)
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('freight.quick_pay_fee_bps', '250',
   'Tarifa del pago rápido, en puntos base sobre el neto del transportista (250 = 2.5 %). 250 o más (D38).'),
  ('freight.quick_pay_exposure_limit_cents', 'null',
   'Límite de exposición del pago rápido en centavos: lo aprobado y no cobrado al cliente. Vacío: sin límite automático.')
on conflict (key) do nothing;

-- Whether a JSON value is a valid quick pay fee: an integer from 250 (D38:
-- "2.5 % o más") to 9999 basis points (under 100 %).
create function public.freight_is_valid_quick_pay_fee(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]{1,4}$' then
    return false;
  end if;
  return (p_value #>> '{}')::integer between 250 and 9999;
end;
$$;

-- Whether a JSON value is a valid exposure limit: null (no limit) or a
-- positive integer of cents a JavaScript number holds exactly.
create function public.freight_is_valid_exposure_limit(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is not distinct from 'null' then
    return true;
  end if;
  if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]{1,15}$' then
    return false;
  end if;
  return (p_value #>> '{}')::bigint > 0;
end;
$$;

revoke all on function public.freight_is_valid_quick_pay_fee(jsonb) from public, anon;
revoke all on function public.freight_is_valid_exposure_limit(jsonb) from public, anon;
grant execute on function public.freight_is_valid_quick_pay_fee(jsonb) to authenticated;
grant execute on function public.freight_is_valid_exposure_limit(jsonb) to authenticated;

-- The current fee (the setting, or 2.5 % if it is missing or malformed).
create function public.freight_quick_pay_fee_bps()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer
     from public.platform_settings s
     where s.key = 'freight.quick_pay_fee_bps' and public.freight_is_valid_quick_pay_fee(s.value)),
    250
  );
$$;

-- The exposure limit in cents, or null (none, or malformed).
create function public.freight_quick_pay_exposure_limit_cents()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (s.value #>> '{}')::bigint
  from public.platform_settings s
  where s.key = 'freight.quick_pay_exposure_limit_cents'
    and jsonb_typeof(s.value) = 'number'
    and public.freight_is_valid_exposure_limit(s.value);
$$;

revoke all on function public.freight_quick_pay_fee_bps() from public, anon, authenticated, service_role;
revoke all on function public.freight_quick_pay_exposure_limit_cents() from public, anon, authenticated, service_role;

-- Same as I5 (20261110080000_freight_invoices.sql), except it also validates
-- the quick pay settings (I4): the fee, 250 to 9999 basis points; the
-- exposure limit, null or a positive integer of cents.
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
    when 'freight.quick_pay_fee_bps' then
      if not public.freight_is_valid_quick_pay_fee(p_value) then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'freight.quick_pay_exposure_limit_cents' then
      if not public.freight_is_valid_exposure_limit(p_value) then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'fulmis.rfc', 'fulmis.legal_name', 'fulmis.tax_regime', 'fulmis.zip' then
      if jsonb_typeof(p_value) = 'string' then
        p_value := to_jsonb(regexp_replace(p_value #>> '{}', '^\s+|\s+$', '', 'g'));
        if p_key = 'fulmis.rfc' then
          p_value := to_jsonb(upper(p_value #>> '{}'));
        end if;
        if (p_key = 'fulmis.rfc' and (p_value #>> '{}') !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$')
           or (p_key = 'fulmis.legal_name' and char_length(p_value #>> '{}') not between 1 and 300)
           or (p_key = 'fulmis.tax_regime' and (p_value #>> '{}') !~ '^[0-9]{3}$')
           or (p_key = 'fulmis.zip' and (p_value #>> '{}') !~ '^[0-9]{5}$') then
          raise exception 'invalid value for %', p_key using errcode = '22023';
        end if;
      elsif jsonb_typeof(p_value) is distinct from 'null' then
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
-- The quick pay of each trip, in its ledger
-- ---------------------------------------------------------------------------
alter table public.freight_ledgers
  add column quick_pay_fee_bps integer
    constraint freight_ledgers_quick_pay_fee_bps_check check (quick_pay_fee_bps between 250 and 9999),
  add column quick_pay_fee_cents bigint,
  add column quick_pay_requested_at timestamptz,
  add column quick_pay_requested_by uuid references auth.users (id) on delete set null,
  add column quick_pay_approved_at timestamptz,
  add column quick_pay_approved_by uuid references auth.users (id) on delete set null,
  add column quick_pay_rejected_at timestamptz,
  add column quick_pay_rejection_reason text
    constraint freight_ledgers_quick_pay_rejection_reason_length
      check (char_length(btrim(quick_pay_rejection_reason)) between 1 and 500),
  -- A request has its frozen fee, computed with the one rounding (I.0.1).
  add constraint freight_ledgers_quick_pay_request_complete check (
    (quick_pay_fee_bps is null) = (quick_pay_fee_cents is null)
    and (quick_pay_fee_bps is null) = (quick_pay_requested_at is null)
  ),
  add constraint freight_ledgers_quick_pay_fee_computed check (
    quick_pay_fee_cents is null
    or quick_pay_fee_cents = public.freight_commission_cents(carrier_net_cents, quick_pay_fee_bps)
  ),
  add constraint freight_ledgers_quick_pay_approved_needs_request
    check (quick_pay_approved_at is null or quick_pay_requested_at is not null),
  add constraint freight_ledgers_quick_pay_requested_status check (
    carrier_status <> 'quick_pay_requested'
    or (quick_pay_requested_at is not null and quick_pay_approved_at is null)
  ),
  -- A rejected request is cleared: only its date and reason stay (until the next one).
  add constraint freight_ledgers_quick_pay_rejection check (
    (quick_pay_rejected_at is null) = (quick_pay_rejection_reason is null)
    and (quick_pay_rejected_at is null or quick_pay_requested_at is null)
  ),
  -- What the carrier is owed: the net, minus the fee once the quick pay is approved.
  drop constraint freight_ledgers_carrier_paid_range,
  drop constraint freight_ledgers_carrier_paid_full,
  add constraint freight_ledgers_carrier_paid_range check (
    carrier_paid_cents between 0
      and carrier_net_cents - case when quick_pay_approved_at is not null then quick_pay_fee_cents else 0 end
  ),
  add constraint freight_ledgers_carrier_paid_full check (
    carrier_status <> 'paid'
    or carrier_paid_cents
       = carrier_net_cents - case when quick_pay_approved_at is not null then quick_pay_fee_cents else 0 end
  );

comment on column public.freight_ledgers.quick_pay_fee_cents is
  'Quick pay (I4, D38): the fee on the carrier''s net, frozen when requested. Once approved, Fulmis pays the net minus it. Never the client''s.';

-- The exposure counts the approved quick pays whose client still owes.
create index freight_ledgers_quick_pay_exposure_idx on public.freight_ledgers (id)
  where quick_pay_approved_at is not null and client_status in ('pending', 'invoiced', 'overdue');

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

-- Why the carrier cannot ask for the quick pay of a trip, or null when it
-- can. The codes are the ones of QuickPayBlocker in @transport/shared:
--   not_open: its side is not pending nor held (requested, scheduled, paid
--     or cancelled); partially_paid: Fulmis already paid part of it;
--   not_delivered: no delivery yet (the delivery event needs the evidence);
--   invoice_missing: the carrier's CFDI to Fulmis is not registered (I5).
create function public.freight_quick_pay_blocker(p_trip public.trips, p_ledger public.freight_ledgers)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_ledger.carrier_status not in ('pending', 'on_hold') then 'not_open'
    when p_ledger.carrier_paid_cents > 0 then 'partially_paid'
    when p_trip.status not in ('delivered', 'closed') or p_trip.delivered_at is null then 'not_delivered'
    when not exists (
      select 1 from public.freight_invoices i
      where i.trip_id = p_trip.id and i.direction = 'carrier_to_fulmis'
    ) then 'invoice_missing'
  end;
$$;

revoke all on function public.freight_quick_pay_blocker(public.trips, public.freight_ledgers)
  from public, anon, authenticated, service_role;

-- The exposure: what Fulmis paid or will pay early (the approved quick nets)
-- and has not collected from the client yet, per trip never below zero. A
-- paid, written off or cancelled client side is out.
create function public.freight_quick_pay_exposure_cents()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(greatest(f.carrier_net_cents - f.quick_pay_fee_cents - f.client_paid_cents, 0)), 0)::bigint
  from public.freight_ledgers f
  where f.quick_pay_approved_at is not null
    and f.client_status in ('pending', 'invoiced', 'overdue');
$$;

revoke all on function public.freight_quick_pay_exposure_cents() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Carrier RPCs
-- ---------------------------------------------------------------------------

-- The current quick pay fee, for the carrier staff to see the quick net
-- before asking (and the admins). Nobody else learns it (42501).
create function public.carrier_quick_pay_fee_bps()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.auth_carrier_company_id() is null and not public.is_admin() then
    raise exception 'only the carrier staff read the quick pay fee' using errcode = '42501';
  end if;
  return public.freight_quick_pay_fee_bps();
end;
$$;

revoke all on function public.carrier_quick_pay_fee_bps() from public, anon;
grant execute on function public.carrier_quick_pay_fee_bps() to authenticated;

-- Asks for the quick pay of a trip: the Gerente of its carrier or a
-- Coordinador of its business unit. p_fee_bps is the fee the caller was
-- shown; it is frozen in the ledger only if it is still the current one.
-- Raises 42501 (nothing revealed) for anyone else or an unknown trip, and
-- 55000 with the blocker (or `fee_changed`) in the detail. Returns the frozen
-- fee and the quick net: { "feeBps", "feeCents", "quickNetCents" }.
create function public.request_quick_pay(p_trip_id uuid, p_fee_bps integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_ledger public.freight_ledgers;
  v_blocker text;
  v_fee_bps integer;
  v_fee bigint;
begin
  -- The trip first (shared, as I3 and I5): assign_trip cannot move it to
  -- another business unit while the caller is checked.
  select * into v_trip from public.trips where id = p_trip_id for share;
  -- coalesce: for anyone but the carrier staff the helpers give null, and
  -- `not null` would let them through.
  if not found
     or not coalesce(v_trip.carrier_company_id = public.auth_fleet_company_id()
                     or v_trip.business_unit_id = any (public.auth_business_unit_ids()), false) then
    raise exception 'trip not available' using errcode = '42501';
  end if;
  select * into v_ledger from public.freight_ledgers where trip_id = v_trip.id for update;
  if not found then
    raise exception 'trip not available' using errcode = '42501';
  end if;

  v_blocker := public.freight_quick_pay_blocker(v_trip, v_ledger);
  if v_blocker is not null then
    raise exception 'quick pay not available' using errcode = '55000', detail = v_blocker;
  end if;
  v_fee_bps := public.freight_quick_pay_fee_bps();
  if p_fee_bps is distinct from v_fee_bps then
    raise exception 'the quick pay fee changed' using errcode = '55000', detail = 'fee_changed';
  end if;
  v_fee := public.freight_commission_cents(v_ledger.carrier_net_cents, v_fee_bps);

  update public.freight_ledgers
  set carrier_status = 'quick_pay_requested',
      quick_pay_fee_bps = v_fee_bps,
      quick_pay_fee_cents = v_fee,
      quick_pay_requested_at = now(),
      quick_pay_requested_by = (select auth.uid()),
      quick_pay_approved_at = null,
      quick_pay_approved_by = null,
      quick_pay_rejected_at = null,
      quick_pay_rejection_reason = null
  where id = v_ledger.id;

  perform public.notify_admins(
    'quick_pay_requested',
    public.freight_notification_data(v_ledger.id, v_ledger.carrier_net_cents - v_fee,
      jsonb_build_object('feeBps', v_fee_bps))
  );

  return jsonb_build_object(
    'feeBps', v_fee_bps, 'feeCents', v_fee, 'quickNetCents', v_ledger.carrier_net_cents - v_fee
  );
end;
$$;

revoke all on function public.request_quick_pay(uuid, integer) from public, anon;
grant execute on function public.request_quick_pay(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs (audited by the ledger's trigger)
-- ---------------------------------------------------------------------------

-- The quick pay exposure and its limit, for /admin/flete.
create function public.admin_quick_pay_exposure()
returns table (exposure_cents bigint, limit_cents bigint, fee_bps integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins read the quick pay exposure' using errcode = '42501';
  end if;
  return query
  select public.freight_quick_pay_exposure_cents(), public.freight_quick_pay_exposure_limit_cents(),
         public.freight_quick_pay_fee_bps();
end;
$$;

revoke all on function public.admin_quick_pay_exposure() from public, anon;
grant execute on function public.admin_quick_pay_exposure() to authenticated;

-- Approves a pending quick pay request: the carrier's payment is scheduled
-- (the admin records it when it is sent, I3). If the exposure with this
-- trip goes over the limit, nothing changes unless p_confirm_over_limit
-- (55000, detail `over_limit`). Returns { "exposureCents", "limitCents" }
-- after the approval.
create function public.admin_approve_quick_pay(p_trip_id uuid, p_confirm_over_limit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger public.freight_ledgers;
  v_trip public.trips;
  v_quick_net bigint;
  v_exposure bigint;
  v_limit bigint;
begin
  if not public.is_admin() then
    raise exception 'only admins approve quick pay requests' using errcode = '42501';
  end if;
  -- One approval at a time: the exposure is a sum over every ledger.
  perform pg_advisory_xact_lock(hashtextextended('public.freight_quick_pay_exposure', 0));

  select * into v_ledger from public.freight_ledgers where trip_id = p_trip_id for update;
  if not found then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  if v_ledger.carrier_status <> 'quick_pay_requested' then
    raise exception 'no quick pay request is pending for this trip' using errcode = '55000', detail = 'not_requested';
  end if;

  v_quick_net := v_ledger.carrier_net_cents - v_ledger.quick_pay_fee_cents;
  v_exposure := public.freight_quick_pay_exposure_cents()
    + case when v_ledger.client_status in ('pending', 'invoiced', 'overdue')
           then greatest(v_quick_net - v_ledger.client_paid_cents, 0) else 0 end;
  v_limit := public.freight_quick_pay_exposure_limit_cents();
  if v_limit is not null and v_exposure > v_limit and not coalesce(p_confirm_over_limit, false) then
    raise exception 'the approval goes over the quick pay exposure limit' using errcode = '55000', detail = 'over_limit';
  end if;

  update public.freight_ledgers
  set carrier_status = 'scheduled',
      quick_pay_approved_at = now(),
      quick_pay_approved_by = (select auth.uid())
  where id = v_ledger.id;

  select * into v_trip from public.trips where id = p_trip_id;
  perform public.notify_carrier_staff(
    v_trip.carrier_company_id, v_trip.business_unit_id, 'quick_pay_approved',
    public.freight_notification_data(v_ledger.id, v_quick_net, null)
  );

  return jsonb_build_object('exposureCents', v_exposure, 'limitCents', v_limit);
end;
$$;

revoke all on function public.admin_approve_quick_pay(uuid, boolean) from public, anon;
grant execute on function public.admin_approve_quick_pay(uuid, boolean) to authenticated;

-- Rejects a pending quick pay request, with the reason the carrier sees.
-- The request is cleared (no fee) and its side goes back to where it was:
-- scheduled if the client paid, held past its date, else pending.
create function public.admin_reject_quick_pay(p_trip_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger public.freight_ledgers;
  v_trip public.trips;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'only admins reject quick pay requests' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'a reason of at most 500 characters is required' using errcode = '22023';
  end if;
  select * into v_ledger from public.freight_ledgers where trip_id = p_trip_id for update;
  if not found then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  if v_ledger.carrier_status <> 'quick_pay_requested' then
    raise exception 'no quick pay request is pending for this trip' using errcode = '55000', detail = 'not_requested';
  end if;

  update public.freight_ledgers
  set carrier_status = case
        when client_status = 'paid' then 'scheduled'
        when carrier_due_on < public.freight_today() then 'on_hold'
        else 'pending'
      end::public.freight_carrier_status,
      quick_pay_fee_bps = null,
      quick_pay_fee_cents = null,
      quick_pay_requested_at = null,
      quick_pay_requested_by = null,
      quick_pay_rejected_at = now(),
      quick_pay_rejection_reason = v_reason
  where id = v_ledger.id;

  select * into v_trip from public.trips where id = p_trip_id;
  perform public.notify_carrier_staff(
    v_trip.carrier_company_id, v_trip.business_unit_id, 'quick_pay_rejected',
    public.freight_notification_data(v_ledger.id, v_ledger.carrier_net_cents, jsonb_build_object('reason', v_reason))
  );
end;
$$;

revoke all on function public.admin_reject_quick_pay(uuid, text) from public, anon;
grant execute on function public.admin_reject_quick_pay(uuid, text) to authenticated;

-- Same as I3 (20261110030100_freight_ledger.sql), except the quick pay (I4):
-- the carrier is owed its net minus the fee once a quick pay is approved; no
-- payment goes to the carrier while a request is pending; and the client's
-- full payment withdraws a pending request (the carrier gets its whole net,
-- scheduled).
create or replace function public.admin_record_freight_payment(
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
  if not v_client and v_ledger.carrier_status = 'quick_pay_requested' then
    raise exception 'a quick pay request is pending: approve or reject it first' using errcode = '55000';
  end if;
  if v_client then
    v_owed := v_ledger.client_amount_cents - v_ledger.client_paid_cents;
  else
    v_owed := v_ledger.carrier_net_cents - v_ledger.carrier_paid_cents
      - case when v_ledger.quick_pay_approved_at is not null then v_ledger.quick_pay_fee_cents else 0 end;
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
          when p_amount_cents = v_owed and carrier_status in ('pending', 'on_hold', 'quick_pay_requested')
            then 'scheduled'
          else carrier_status
        end,
        -- A pending quick pay request is withdrawn: the client paid first.
        quick_pay_fee_bps = case when p_amount_cents = v_owed and carrier_status = 'quick_pay_requested'
                                 then null else quick_pay_fee_bps end,
        quick_pay_fee_cents = case when p_amount_cents = v_owed and carrier_status = 'quick_pay_requested'
                                   then null else quick_pay_fee_cents end,
        quick_pay_requested_at = case when p_amount_cents = v_owed and carrier_status = 'quick_pay_requested'
                                      then null else quick_pay_requested_at end,
        quick_pay_requested_by = case when p_amount_cents = v_owed and carrier_status = 'quick_pay_requested'
                                      then null else quick_pay_requested_by end
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

-- ---------------------------------------------------------------------------
-- Reads (their return types change, so they are recreated)
-- ---------------------------------------------------------------------------

-- Same as I3 (20261110030100_freight_ledger.sql), plus the quick pay of each
-- trip (I4): its frozen fee and quick net, when it was requested, approved
-- or rejected (with the reason) and, while it can be asked for, a null
-- blocker. What is still owed counts the fee once approved. Still never the
-- client's terms, due date, status nor payments.
drop function public.carrier_freight_ledger();

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
  trip_created_at timestamptz,
  freight_cents bigint,
  commission_bps integer,
  commission_cents bigint,
  net_cents bigint,
  due_on date,
  status public.freight_carrier_status,
  paid_cents bigint,
  pending_cents bigint,
  payments jsonb,
  quick_pay_fee_bps integer,
  quick_pay_fee_cents bigint,
  quick_pay_net_cents bigint,
  quick_pay_requested_at timestamptz,
  quick_pay_approved_at timestamptz,
  quick_pay_rejected_at timestamptz,
  quick_pay_rejection_reason text,
  quick_pay_blocker text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, t.id, t.load_id, t.business_unit_id, l.origin_city, l.destination_city, t.status, t.delivered_at, t.created_at,
         f.commission_cents + f.carrier_net_cents, f.commission_bps, f.commission_cents, f.carrier_net_cents,
         f.carrier_due_on,
         public.freight_effective_carrier_status(f.carrier_status, f.carrier_due_on, f.client_status),
         f.carrier_paid_cents,
         f.carrier_net_cents - f.carrier_paid_cents
           - case when f.quick_pay_approved_at is not null then f.quick_pay_fee_cents else 0 end,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'amountCents', p.amount_cents, 'paidOn', p.paid_on, 'speiReference', p.spei_reference
           ) order by p.paid_on, p.created_at)
           from public.freight_payments p
           where p.ledger_id = f.id and p.direction = 'fulmis_to_carrier'
         ), '[]'::jsonb),
         f.quick_pay_fee_bps, f.quick_pay_fee_cents, f.carrier_net_cents - f.quick_pay_fee_cents,
         f.quick_pay_requested_at, f.quick_pay_approved_at, f.quick_pay_rejected_at, f.quick_pay_rejection_reason,
         public.freight_quick_pay_blocker(t, f)
  from public.freight_ledgers f
  join public.trips t on t.id = f.trip_id
  join public.loads l on l.id = t.load_id
  where (t.carrier_company_id = public.auth_fleet_company_id()
         or t.business_unit_id = any (public.auth_business_unit_ids()))
    and f.carrier_status <> 'cancelled'
  order by f.carrier_due_on nulls last, t.created_at desc, f.id;
$$;

revoke all on function public.carrier_freight_ledger() from public, anon;
grant execute on function public.carrier_freight_ledger() to authenticated;

-- Same as I6 (20261110090100_brokered_loads.sql), plus the quick pay of each
-- trip (I4): the frozen fee, when it was requested, approved or rejected,
-- and the reason.
drop function public.admin_freight_ledger();

create function public.admin_freight_ledger()
returns table (
  ledger_id uuid,
  trip_id uuid,
  load_id uuid,
  origin_city text,
  destination_city text,
  trip_status public.trip_status,
  delivered_at timestamptz,
  trip_created_at timestamptz,
  shipper_company_id uuid,
  shipper_name text,
  carrier_company_id uuid,
  carrier_name text,
  client_amount_cents bigint,
  commission_bps integer,
  commission_cents bigint,
  carrier_net_cents bigint,
  margin_cents bigint,
  client_terms_days smallint,
  client_due_on date,
  client_status public.freight_client_status,
  client_paid_cents bigint,
  carrier_due_on date,
  carrier_status public.freight_carrier_status,
  carrier_paid_cents bigint,
  needs_review boolean,
  review_note text,
  payments jsonb,
  quick_pay_fee_bps integer,
  quick_pay_fee_cents bigint,
  quick_pay_requested_at timestamptz,
  quick_pay_approved_at timestamptz,
  quick_pay_rejected_at timestamptz,
  quick_pay_rejection_reason text
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
  select f.id, t.id, t.load_id, l.origin_city, l.destination_city, t.status, t.delivered_at, t.created_at,
         t.shipper_company_id, sc.legal_name, t.carrier_company_id, cc.legal_name,
         f.client_amount_cents, f.commission_bps, f.commission_cents, f.carrier_net_cents, f.margin_cents,
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
         ), '[]'::jsonb),
         f.quick_pay_fee_bps, f.quick_pay_fee_cents, f.quick_pay_requested_at, f.quick_pay_approved_at,
         f.quick_pay_rejected_at, f.quick_pay_rejection_reason
  from public.freight_ledgers f
  join public.trips t on t.id = f.trip_id
  join public.loads l on l.id = t.load_id
  join public.companies sc on sc.id = t.shipper_company_id
  join public.companies cc on cc.id = t.carrier_company_id
  order by f.needs_review desc, f.client_due_on nulls last, t.created_at desc, f.id;
end;
$$;

revoke all on function public.admin_freight_ledger() from public, anon;
grant execute on function public.admin_freight_ledger() to authenticated;
