-- I5 · Freight invoices (CFDI) (D37; plan-v1.md §I, I5).
--
-- Fulmis invoices the client 100 % of the freight and the carrier invoices
-- Fulmis the freight minus the commission (D08-E2, D33-E1). Both CFDI (XML,
-- and the PDF) are uploaded through two Edge Functions, which parse the XML
-- (supabase/functions/_shared/cfdi-upload.ts with
-- packages/shared/src/freight/cfdi.ts) and call the service RPCs below:
--
--   * validate-carrier-cfdi: the carrier's Gerente, or a Coordinador of the
--     trip's business unit, uploads the carrier's CFDI to Fulmis. The issuer
--     must be the carrier company's RFC, the receiver Fulmis' RFC (setting
--     fulmis.rfc; without it the receiver is not checked and the invoice is
--     saved "Sin validar"), the total the carrier's net (± 1 cent), MXN, and
--     the UUID unique in the platform.
--   * issue-client-cfdi: Fulmis' CFDI to the client. Behind a CfdiProvider
--     interface; with the `manual` provider (the default, and the only one
--     until Mateo chooses a PAC) the admin uploads the XML and PDF issued
--     elsewhere and they are checked the same way: the issuer Fulmis (when
--     fulmis.rfc is set), the receiver the shipper company's RFC and the
--     total the client amount. Registering it moves the client's side from
--     `pending` to `invoiced`; `overdue`, `paid` and `written_off` keep their
--     status and the invoice is only linked to the trip. A cancelled trip is
--     never invoiced, and a client without payment terms ("Plazo por
--     definir") is not invoiced until the admin sets them (I3).
--   * freight_invoices: one invoice per trip and direction, read by side
--     through RLS (the client its CFDI from Fulmis; the carrier staff of the
--     trip its CFDI to Fulmis; the admin both). Nobody writes it directly:
--     only record_freight_invoice_service (service role), which checks the
--     uploader and every rule again.
--   * Storage: private bucket `invoices`, {trip_id}/{direction}/{random
--     uuid}.xml|pdf, written only by the Edge Functions (service role) and
--     readable only through a registered invoice the caller can read.
--   * Settings fulmis.rfc, fulmis.legal_name, fulmis.tax_regime and
--     fulmis.zip (null by default: the legal entity is "en proceso"). Every
--     signed-in user reads them: the carrier needs them to invoice Fulmis.
--
-- Lock order: the ledger row only (as admin_record_freight_payment), which
-- serializes the invoices of a trip.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.freight_invoice_direction as enum ('fulmis_to_client', 'carrier_to_fulmis');
create type public.freight_invoice_validation as enum ('validated', 'unvalidated');

comment on type public.freight_invoice_direction is
  'Who invoices whom for a trip''s freight (I5). Mirrors FREIGHT_INVOICE_DIRECTIONS in @transport/shared.';
comment on type public.freight_invoice_validation is
  'validated: every party checked; unvalidated: Fulmis'' RFC (fulmis.rfc) was not set, so its side was not checked.';

-- ---------------------------------------------------------------------------
-- Settings: Fulmis' fiscal data (empty while the legal entity is in process)
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('fulmis.rfc', 'null',
   'RFC de Fulmis. Vacío: los CFDI se guardan "Sin validar" del lado de Fulmis.'),
  ('fulmis.legal_name', 'null', 'Razón social de Fulmis (receptor de los CFDI de los transportistas).'),
  ('fulmis.tax_regime', 'null', 'Régimen fiscal de Fulmis (clave del SAT, tres dígitos).'),
  ('fulmis.zip', 'null', 'Código postal del domicilio fiscal de Fulmis.')
on conflict (key) do nothing;

-- Same as I3 (20261110030100_freight_ledger.sql), except it also validates
-- the fulmis.* keys: an RFC, a legal name of 1 to 300 characters, a three
-- digit tax regime and a five digit zip, each one or null (saved trimmed and,
-- the RFC, in capitals).
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

-- Fulmis' RFC, or null while it is not set (or malformed).
create function public.fulmis_rfc()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.value #>> '{}'
  from public.platform_settings s
  where s.key = 'fulmis.rfc'
    and jsonb_typeof(s.value) = 'string'
    and (s.value #>> '{}') ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$';
$$;

revoke all on function public.fulmis_rfc() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- freight_invoices
-- ---------------------------------------------------------------------------
create table public.freight_invoices (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  direction public.freight_invoice_direction not null,
  cfdi_uuid uuid not null,
  issuer_rfc text not null
    constraint freight_invoices_issuer_rfc_format check (issuer_rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  receiver_rfc text not null
    constraint freight_invoices_receiver_rfc_format check (receiver_rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  total_cents bigint not null constraint freight_invoices_total_positive check (total_cents > 0),
  currency text not null constraint freight_invoices_currency_mxn check (currency = 'MXN'),
  issued_at timestamptz not null,
  validation public.freight_invoice_validation not null,
  -- Who issued it: `manual` (uploaded) or the PAC that stamped it.
  provider text not null default 'manual' constraint freight_invoices_provider_format check (provider ~ '^[a-z][a-z0-9_]{0,29}$'),
  xml_path text not null,
  pdf_path text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint freight_invoices_trip_direction_key unique (trip_id, direction),
  -- The SAT's UUID identifies one CFDI: it is never registered twice.
  constraint freight_invoices_cfdi_uuid_key unique (cfdi_uuid),
  constraint freight_invoices_xml_path_key unique (xml_path),
  constraint freight_invoices_pdf_path_key unique (pdf_path),
  constraint freight_invoices_xml_path_format check (
    xml_path ~ ('^' || trip_id::text || '/' || direction::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.xml$')
  ),
  constraint freight_invoices_pdf_path_format check (
    pdf_path is null
    or pdf_path ~ ('^' || trip_id::text || '/' || direction::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$')
  ),
  -- The client downloads Fulmis' invoice: it always has its PDF.
  constraint freight_invoices_client_pdf check (direction <> 'fulmis_to_client' or pdf_path is not null)
);

comment on table public.freight_invoices is
  'CFDI of each trip''s freight (I5, D37): Fulmis to the client and the carrier to Fulmis. Each side reads only its own direction (RLS). Written only by record_freight_invoice_service.';

create trigger freight_invoices_audit_admin
after insert or update or delete on public.freight_invoices
for each row execute function public.audit_admin_action();

-- Privileges: read by side; nobody writes it (the service RPC is security
-- definer). uploaded_by stays out of the client's reach.
revoke all on table public.freight_invoices from anon, authenticated;
grant select (
  id, trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc, total_cents, currency, issued_at,
  validation, provider, xml_path, pdf_path, created_at
) on table public.freight_invoices to authenticated;

alter table public.freight_invoices enable row level security;

create policy freight_invoices_select_admin
on public.freight_invoices
for select
to authenticated
using ((select public.is_admin()));

-- The client: Fulmis' invoices of its company's trips.
create policy freight_invoices_select_shipper
on public.freight_invoices
for select
to authenticated
using (
  direction = 'fulmis_to_client'
  and exists (
    select 1 from public.trips t
    where t.id = freight_invoices.trip_id
      and t.shipper_company_id = (select public.auth_shipper_company_id())
  )
);

-- The carrier staff of the trip (the Gerente, a Coordinador of its business
-- unit): the carrier's own invoices to Fulmis. Never the operator.
create policy freight_invoices_select_carrier
on public.freight_invoices
for select
to authenticated
using (
  direction = 'carrier_to_fulmis'
  and exists (
    select 1 from public.trips t
    where t.id = freight_invoices.trip_id
      and (t.carrier_company_id = (select public.auth_fleet_company_id())
           or t.business_unit_id = any (public.auth_business_unit_ids()))
  )
);

-- ---------------------------------------------------------------------------
-- Storage: private bucket `invoices`
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 5242880, array['application/xml', 'text/xml', 'application/pdf'])
on conflict (id) do nothing;

-- Only the files of an invoice the caller can read (the subquery is filtered
-- by the policies of freight_invoices). No insert, update or delete policy:
-- only the Edge Functions (service role) write the bucket.
create policy invoices_bucket_select_by_side
on storage.objects
for select
to authenticated
using (
  bucket_id = 'invoices'
  and exists (
    select 1 from public.freight_invoices i
    where i.xml_path = objects.name or i.pdf_path = objects.name
  )
);

-- ---------------------------------------------------------------------------
-- Rules (service role only)
-- ---------------------------------------------------------------------------

-- Whether p_user_id may upload the trip's invoice in that direction: Fulmis'
-- CFDI to the client, an admin; the carrier's CFDI to Fulmis, the Gerente of
-- the trip's carrier or a Coordinador of its business unit (as
-- carrier_freight_ledger, by user id: the Edge Function acts with the
-- service role).
create function public.freight_invoice_uploader_allowed(
  p_user_id uuid,
  p_trip public.trips,
  p_direction public.freight_invoice_direction
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_direction
    when 'fulmis_to_client' then exists (
      select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin'
    )
    else exists (
      select 1
      from public.profiles p
      join public.companies c on c.id = p.company_id and c.type = 'carrier' and c.archived_at is null
      where p.id = p_user_id
        and c.id = p_trip.carrier_company_id
        and (
          p.role = 'manager'
          or (
            p.role = 'coordinator'
            and exists (
              select 1
              from public.business_units b
              join public.business_unit_coordinators bc on bc.business_unit_id = b.id
              where b.id = p_trip.business_unit_id
                and b.archived_at is null
                and bc.profile_id = p.id
            )
          )
        )
    )
  end;
$$;

revoke all on function public.freight_invoice_uploader_allowed(uuid, public.trips, public.freight_invoice_direction)
  from public, anon, authenticated, service_role;

-- Every reason a CFDI cannot be registered for the trip (empty: it can), and
-- whether it is fully validated. The codes are the ones of
-- FreightInvoiceFailure in @transport/shared.
create function public.freight_invoice_failures(
  p_trip public.trips,
  p_ledger public.freight_ledgers,
  p_direction public.freight_invoice_direction,
  p_cfdi_uuid uuid,
  p_issuer_rfc text,
  p_receiver_rfc text,
  p_total_cents bigint,
  p_currency text,
  out failures text[],
  out validation public.freight_invoice_validation
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fulmis text := public.fulmis_rfc();
  v_client boolean := p_direction = 'fulmis_to_client';
  v_issuer text;
  v_receiver text;
  v_expected bigint;
begin
  failures := '{}';
  validation := case when v_fulmis is null then 'unvalidated' else 'validated' end;
  if p_ledger.client_status = 'cancelled' then
    failures := array['trip_cancelled'];
    return;
  end if;
  if exists (select 1 from public.freight_invoices i where i.trip_id = p_trip.id and i.direction = p_direction) then
    failures := array['already_invoiced'];
    return;
  end if;
  if v_client and p_ledger.client_terms_days is null then
    failures := array_append(failures, 'terms_missing');
  end if;

  if v_client then
    v_issuer := v_fulmis;
    select c.rfc into v_receiver from public.companies c where c.id = p_trip.shipper_company_id;
    v_expected := p_ledger.client_amount_cents;
  else
    select c.rfc into v_issuer from public.companies c where c.id = p_trip.carrier_company_id;
    v_receiver := v_fulmis;
    v_expected := p_ledger.carrier_net_cents;
  end if;

  -- Fulmis' side is only checked once its RFC is set.
  if v_issuer is not null and upper(coalesce(p_issuer_rfc, '')) is distinct from v_issuer then
    failures := array_append(failures, 'issuer_mismatch');
  end if;
  if v_receiver is not null and upper(coalesce(p_receiver_rfc, '')) is distinct from v_receiver then
    failures := array_append(failures, 'receiver_mismatch');
  end if;
  if p_total_cents is null or abs(p_total_cents - v_expected) > 1 then
    failures := array_append(failures, 'total_mismatch');
  end if;
  if p_currency is distinct from 'MXN' then
    failures := array_append(failures, 'currency');
  end if;
  if p_cfdi_uuid is null or exists (select 1 from public.freight_invoices i where i.cfdi_uuid = p_cfdi_uuid) then
    failures := array_append(failures, 'uuid_taken');
  end if;
end;
$$;

revoke all on function public.freight_invoice_failures(
  public.trips, public.freight_ledgers, public.freight_invoice_direction, uuid, text, text, bigint, text
) from public, anon, authenticated, service_role;

-- The Edge Functions check the parsed CFDI before storing its files: the
-- failures (empty when it can be registered) and the validation it would
-- get. An uploader without access to the trip, or an unknown trip, gets
-- 42501 (nothing revealed).
create function public.check_freight_invoice_service(
  p_user_id uuid,
  p_trip_id uuid,
  p_direction public.freight_invoice_direction,
  p_cfdi_uuid uuid,
  p_issuer_rfc text,
  p_receiver_rfc text,
  p_total_cents bigint,
  p_currency text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_ledger public.freight_ledgers;
  v_result record;
begin
  -- Explicit caller check on top of the grant: only the service role key.
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id;
  if not found or p_direction is null
     or not public.freight_invoice_uploader_allowed(p_user_id, v_trip, p_direction) then
    raise exception 'trip not available' using errcode = '42501';
  end if;
  select * into v_ledger from public.freight_ledgers where trip_id = v_trip.id;
  if not found then
    raise exception 'trip not available' using errcode = '42501';
  end if;
  select * into v_result from public.freight_invoice_failures(
    v_trip, v_ledger, p_direction, p_cfdi_uuid, p_issuer_rfc, p_receiver_rfc, p_total_cents, p_currency
  );
  return jsonb_build_object('failures', to_jsonb(v_result.failures), 'validation', v_result.validation);
end;
$$;

revoke all on function public.check_freight_invoice_service(
  uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.check_freight_invoice_service(
  uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text
) to service_role;

-- Registers a CFDI whose files the Edge Function already stored. Checks the
-- uploader and every rule again under the ledger's lock (a failure raises
-- 22023 with the codes in the detail; a UUID registered meanwhile, 23505).
-- Fulmis' invoice moves the client's side from pending to invoiced; any other
-- status keeps it. An admin's upload is audited. Returns the invoice id and
-- its validation: { "invoiceId": …, "validation": … }.
create function public.record_freight_invoice_service(
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
  select * into v_trip from public.trips where id = p_trip_id;
  if not found or p_direction is null
     or not public.freight_invoice_uploader_allowed(p_user_id, v_trip, p_direction) then
    raise exception 'trip not available' using errcode = '42501';
  end if;
  select * into v_ledger from public.freight_ledgers where trip_id = v_trip.id for update;
  if not found then
    raise exception 'trip not available' using errcode = '42501';
  end if;
  if p_issued_at is null then
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

revoke all on function public.record_freight_invoice_service(
  uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text, timestamp, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_freight_invoice_service(
  uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text, timestamp, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Rate limit of the two Edge Functions, per user and minute
-- ---------------------------------------------------------------------------
-- Same as H2 (20261103000100_trip_operator_links.sql), plus the invoice
-- uploads (I5): a person uploads a few CFDI at a time; this stops scripts.
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
    ('redeem-invitation-token', 'service', 5, 600),
    -- G6: Edge Function shared-document-url, per user and minute.
    ('shared_document_url', 'user', 30, 60),
    -- H2: opening a trip link; a person opens it a few times a day.
    ('open_trip_operator_link', 'rpc', 30, 60),
    -- I5: Edge Functions validate-carrier-cfdi and issue-client-cfdi.
    ('freight_invoice_upload', 'user', 20, 60)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

revoke all on function public.rate_limit_policy(text) from public, anon, authenticated, service_role;
