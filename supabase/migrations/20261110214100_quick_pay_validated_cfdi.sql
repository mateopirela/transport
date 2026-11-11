-- I4 fix · Quick pay only with the carrier's CFDI validated (plan-v1.md §I4:
-- "CFDI del transportista validado (I5)").
--
-- freight_quick_pay_blocker only asked for the carrier's CFDI to Fulmis to
-- be registered. Without Fulmis' RFC (setting fulmis.rfc, null by default:
-- the legal entity is "en proceso") I5 saves that CFDI "Sin validar" with its
-- receiver unchecked, so a CFDI made out to anyone let the carrier ask
-- Fulmis to pay early.
--
--   * freight_carrier_invoice_blocker(trip): null when the carrier's CFDI to
--     Fulmis is validated, else why not: invoice_missing (none registered),
--     fulmis_rfc_missing ("Sin validar": Fulmis has not set its RFC yet) or
--     invoice_unvalidated ("Sin validar" and not made out to Fulmis' RFC).
--     freight_quick_pay_blocker ends with it, so request_quick_pay and
--     Cobranza (carrier_freight_ledger, app and web) give that reason.
--   * admin_approve_quick_pay refuses a request whose CFDI is not validated
--     (55000, the same code in the detail), and admin_freight_ledger returns
--     it (carrier_invoice_blocker) for /admin/flete to say why.
--   * "Sin validar" ends when Fulmis sets its RFC, as I5 tells the carrier
--     ("quedará 'Sin validar' hasta que Fulmis tenga su RFC"): saving
--     fulmis.rfc validates the carrier CFDI whose receiver is that RFC (the
--     issuer, total, currency and UUID were checked on upload). A CFDI
--     registered while the RFC is being saved waits for it (a share lock on
--     the setting's row) and is validated the same way, so none is left
--     behind. The audit trigger of freight_invoices records each change.
--     If the RFC was already saved before this migration, the CFDI made out
--     to it are validated here.
--   * Requests made before this fix are kept as they are, none is withdrawn
--     in silence: an approved one (scheduled or paid) stays, Fulmis already
--     committed to it; a pending one stays pending, the admin cannot approve
--     it until its CFDI is validated and /admin/flete says why, so the admin
--     sets Fulmis' RFC (which validates it) or rejects it with the reason the
--     carrier sees.
--
-- Lock order: unchanged for the quick pay RPCs (the trip, shared; then its
-- ledger). A CFDI's registration takes, after the ledger, the share lock of
-- the fulmis.rfc setting row; saving the setting locks only that row and
-- then the carrier invoices, never a ledger.

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

-- Why the carrier's CFDI to Fulmis of a trip does not allow the quick pay,
-- or null when it is validated. Codes of QuickPayBlocker in @transport/shared.
create function public.freight_carrier_invoice_blocker(p_trip_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when i.id is null then 'invoice_missing'
    when i.validation = 'validated' then null
    when public.fulmis_rfc() is null then 'fulmis_rfc_missing'
    else 'invoice_unvalidated'
  end
  from (select 1) as one
  left join public.freight_invoices i on i.trip_id = p_trip_id and i.direction = 'carrier_to_fulmis';
$$;

revoke all on function public.freight_carrier_invoice_blocker(uuid)
  from public, anon, authenticated, service_role;

-- Same as I4 (20261110100100_quick_pay.sql), except the carrier's CFDI must
-- be validated, not only registered:
--   not_open: its side is not pending nor held (requested, scheduled, paid
--     or cancelled); partially_paid: Fulmis already paid part of it;
--   not_delivered: no delivery yet (the delivery event needs the evidence);
--   then freight_carrier_invoice_blocker: invoice_missing,
--     fulmis_rfc_missing or invoice_unvalidated.
create or replace function public.freight_quick_pay_blocker(p_trip public.trips, p_ledger public.freight_ledgers)
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
    else public.freight_carrier_invoice_blocker(p_trip.id)
  end;
$$;

revoke all on function public.freight_quick_pay_blocker(public.trips, public.freight_ledgers)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- "Sin validar" ends when Fulmis sets its RFC
-- ---------------------------------------------------------------------------

-- Validates the carrier CFDI "Sin validar" made out to p_rfc (Fulmis' RFC)
-- and returns how many. Only the receiver was left unchecked on upload; a
-- CFDI made out to another RFC stays "Sin validar". (Fulmis' CFDI to the
-- clients keep their validation: out of this fix.)
create function public.freight_validate_carrier_invoices(p_rfc text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_rfc is null or p_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' then
    return 0;
  end if;
  update public.freight_invoices
  set validation = 'validated'
  where direction = 'carrier_to_fulmis'
    and validation = 'unvalidated'
    and receiver_rfc = p_rfc;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.freight_validate_carrier_invoices(text) from public, anon, authenticated, service_role;

-- Saving fulmis.rfc validates the carrier CFDI made out to it.
create function public.freight_invoices_validate_on_fulmis_rfc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(new.value) = 'string' then
    perform public.freight_validate_carrier_invoices(new.value #>> '{}');
  end if;
  return null;
end;
$$;

revoke all on function public.freight_invoices_validate_on_fulmis_rfc() from public, anon, authenticated, service_role;

create trigger platform_settings_fulmis_rfc_validates_invoices
after insert or update of value on public.platform_settings
for each row
when (new.key = 'fulmis.rfc')
execute function public.freight_invoices_validate_on_fulmis_rfc();

-- A carrier CFDI registered "Sin validar" while an admin saves fulmis.rfc
-- would miss both checks (each transaction sees the other's change only once
-- committed). Its insertion waits for that save (the share lock of the
-- setting's row) and reads the RFC again: made out to it, it is validated.
create function public.freight_invoices_validate_receiver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'carrier_to_fulmis' and new.validation = 'unvalidated' then
    perform 1 from public.platform_settings where key = 'fulmis.rfc' for share;
    if new.receiver_rfc = public.fulmis_rfc() then
      new.validation := 'validated';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.freight_invoices_validate_receiver() from public, anon, authenticated, service_role;

create trigger freight_invoices_validate_receiver
before insert on public.freight_invoices
for each row
execute function public.freight_invoices_validate_receiver();

-- If Fulmis' RFC was already saved before this migration, the carrier CFDI
-- registered "Sin validar" before it and made out to it are validated now
-- (no trigger saw that save).
select public.freight_validate_carrier_invoices(public.fulmis_rfc());

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

-- Same as I4 (20261110100100_quick_pay.sql), except a request whose CFDI is
-- not validated is not approved (55000, detail invoice_missing,
-- fulmis_rfc_missing or invoice_unvalidated): the admin sets Fulmis' RFC or
-- rejects it with the reason. The ledger's lock keeps the CFDI from being
-- registered meanwhile.
create or replace function public.admin_approve_quick_pay(p_trip_id uuid, p_confirm_over_limit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger public.freight_ledgers;
  v_trip public.trips;
  v_blocker text;
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
  v_blocker := public.freight_carrier_invoice_blocker(p_trip_id);
  if v_blocker is not null then
    raise exception 'the carrier''s CFDI to Fulmis is not validated' using errcode = '55000', detail = v_blocker;
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

-- Same as I4 (20261110100100_quick_pay.sql), plus carrier_invoice_blocker:
-- null when the carrier's CFDI to Fulmis is validated, else why not
-- (freight_carrier_invoice_blocker), for /admin/flete to say why a pending
-- quick pay request cannot be approved.
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
  quick_pay_rejection_reason text,
  carrier_invoice_blocker text
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
         f.quick_pay_rejected_at, f.quick_pay_rejection_reason,
         public.freight_carrier_invoice_blocker(t.id)
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
