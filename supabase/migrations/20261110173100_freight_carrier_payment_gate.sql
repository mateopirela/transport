-- I3 fix · The carrier is paid only once the client paid (D33-E1), and the
-- carrier's commission override stays with the admins (plan-v1.md §I3).
--
--   * admin_record_freight_payment: a payment `fulmis_to_carrier` needs the
--     client's side `paid` (D33-E1: Fulmis pays the carrier "al vencer el
--     plazo del cliente, una vez que el cliente pagó") or an approved quick
--     pay (D38, I4: quick_pay_approved_at, set by admin_approve_quick_pay).
--     Otherwise: SQLSTATE 55000 "the client has not paid this trip yet".
--     The client's partial payments work as before.
--   * companies.commission_bps: every member of the company (operators too)
--     read it through the table-wide SELECT of authenticated. The table-wide
--     grant goes and every other column is granted again by name; admins
--     read the override through admin_company_commission_bps(). A column
--     added to companies later must be granted here too to be readable.
--
-- Lock order: unchanged (the trip's ledger only, as I3 and I4).

-- ---------------------------------------------------------------------------
-- companies.commission_bps: admins only
-- ---------------------------------------------------------------------------
revoke select on table public.companies from authenticated;
grant select (
  id, type, legal_name, rfc, status, status_reason, contact_name, contact_email, contact_phone,
  created_by, created_at, updated_at, archived_at, is_owner_operator,
  fiscal_street, fiscal_exterior_number, fiscal_interior_number, fiscal_neighborhood,
  fiscal_postal_code, fiscal_municipality, fiscal_state, legal_representative_name,
  payment_terms_days
) on table public.companies to authenticated;

-- A carrier's commission override (null: the general commission), for the
-- admin's company detail.
create function public.admin_company_commission_bps(p_company_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bps integer;
begin
  if not public.is_admin() then
    raise exception 'only admins read commissions' using errcode = '42501';
  end if;
  select c.commission_bps into v_bps from public.companies c where c.id = p_company_id;
  if not found then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  return v_bps;
end;
$$;

revoke all on function public.admin_company_commission_bps(uuid) from public, anon;
grant execute on function public.admin_company_commission_bps(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_record_freight_payment
-- ---------------------------------------------------------------------------

-- Same as I4 (20261110100100_quick_pay.sql), except a payment to the carrier
-- needs the client's side paid or an approved quick pay (D33-E1, D38).
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
  -- D33-E1: Fulmis pays the carrier once the client paid; before that, only
  -- with an approved quick pay (D38).
  if not v_client and v_ledger.client_status <> 'paid' and v_ledger.quick_pay_approved_at is null then
    raise exception 'the client has not paid this trip yet' using errcode = '55000';
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
