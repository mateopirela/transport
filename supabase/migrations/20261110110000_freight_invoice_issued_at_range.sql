-- I5 · Correction (verification, round 1): the CFDI's `Fecha` within a
-- plausible range.
--
-- record_freight_invoice_service took any valid `timestamp`. A CFDI dated
-- 9999-12-31 after 18:00 (Mexico City) is year 10000 in UTC: PostgREST returns
-- it as "10000-01-01T…", which JavaScript cannot read, and the pages that list
-- invoices (/admin/flete, the carrier's Cobranza) broke for good, since a
-- registered invoice cannot be replaced. Dates such as year 0100 were taken
-- too. Now:
--
--   * the RPC refuses (22023, detail `issued_at`, which the Edge Functions
--     show with its copy) a `Fecha` before 2022-01-01 (CFDI 4.0 came into
--     force then) or more than a day past now in Mexico City (the SAT does
--     not stamp a CFDI dated in the future; the day covers clocks and the
--     issuer's time zone). Mirror of parseCfdi (packages/shared/src/freight/cfdi.ts);
--   * the table checks the same lower bound and an upper bound every client
--     can read (before 2100), on top of the RPC. NOT VALID: rows that already
--     exist are not checked (the apps show a date they cannot read as "fecha
--     no válida" instead of failing), every new or changed row is.

create or replace function public.record_freight_invoice_service(
  p_user_id uuid,
  p_trip_id uuid,
  p_direction public.freight_invoice_direction,
  p_cfdi_uuid uuid,
  p_issuer_rfc text,
  p_receiver_rfc text,
  p_total_cents bigint,
  p_currency text,
  p_issued_at timestamp,
  p_xml_path text,
  p_pdf_path text,
  p_provider text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_ledger public.freight_ledgers;
  v_result record;
  v_invoice public.freight_invoices;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  -- The trip first (shared, as the lock order of I3: trip, then ledger):
  -- assign_trip cannot move it to another business unit while the uploader
  -- is checked and the invoice is registered.
  select * into v_trip from public.trips where id = p_trip_id for share;
  if not found or p_direction is null
     or not public.freight_invoice_uploader_allowed(p_user_id, v_trip, p_direction) then
    raise exception 'trip not available' using errcode = '42501';
  end if;
  select * into v_ledger from public.freight_ledgers where trip_id = v_trip.id for update;
  if not found then
    raise exception 'trip not available' using errcode = '42501';
  end if;
  -- `Fecha` is the issuer's local time without a zone, read in Mexico City.
  if p_issued_at is null
     or p_issued_at < timestamp '2022-01-01 00:00:00'
     or (p_issued_at at time zone 'America/Mexico_City') > now() + interval '1 day' then
    raise exception 'invalid invoice' using errcode = '22023', detail = 'issued_at';
  end if;

  select * into v_result from public.freight_invoice_failures(
    v_trip, v_ledger, p_direction, p_cfdi_uuid, p_issuer_rfc, p_receiver_rfc, p_total_cents, p_currency
  );
  if cardinality(v_result.failures) > 0 then
    raise exception 'invalid invoice' using errcode = '22023', detail = array_to_string(v_result.failures, ',');
  end if;

  begin
    insert into public.freight_invoices (
      trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc, total_cents, currency, issued_at,
      validation, provider, xml_path, pdf_path, uploaded_by
    ) values (
      v_trip.id, p_direction, p_cfdi_uuid, upper(p_issuer_rfc), upper(p_receiver_rfc), p_total_cents, p_currency,
      p_issued_at at time zone 'America/Mexico_City',
      v_result.validation, coalesce(p_provider, 'manual'), p_xml_path, p_pdf_path, p_user_id
    )
    returning * into v_invoice;
  exception when unique_violation then
    -- Another trip registered the same UUID at the same time.
    raise exception 'invalid invoice' using errcode = '23505', detail = 'uuid_taken';
  end;

  if p_direction = 'fulmis_to_client' then
    update public.freight_ledgers
    set client_status = 'invoiced'
    where id = v_ledger.id and client_status = 'pending';

    -- The service role is not an admin for audit_admin_action: the admin's
    -- upload is logged here, as theirs.
    insert into public.audit_log (actor_id, action, table_name, record_id, company_id, old_data, new_data)
    values (p_user_id, 'insert', 'freight_invoices', v_invoice.id, v_trip.shipper_company_id, null, to_jsonb(v_invoice));
  end if;

  return jsonb_build_object('invoiceId', v_invoice.id, 'validation', v_invoice.validation);
end;
$$;

-- create or replace keeps the privileges; stated again so they stay obvious.
revoke all on function public.record_freight_invoice_service(
  uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text, timestamp, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_freight_invoice_service(
  uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text, timestamp, text, text, text
) to service_role;

-- 2022-01-01 00:00 in Mexico City (then UTC-6), and before 2100 in UTC.
alter table public.freight_invoices
  add constraint freight_invoices_issued_at_range check (
    issued_at >= timestamptz '2022-01-01 00:00:00-06'
    and issued_at < timestamptz '2100-01-01 00:00:00+00'
  ) not valid;
