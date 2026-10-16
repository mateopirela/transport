-- Security matrix (B24): role x table x operation x "another company", on the
-- demo seed plus a fixture row in every table the seed leaves empty.
--
--   supabase test db supabase/seed-tests
--
-- * Read: for every user of the seed (each role and company), an outsider of
--   each role (approved companies with no relation to the seed) and anon,
--   every row they can read in every table (and Storage object) must belong
--   to their own company, by the ownership rules of tests.ownership.
-- * Update: same check for the rows they manage to update in the tables that
--   accept direct updates. Clients cannot delete (18_security_audit).
-- * RPCs: the outsiders call every client RPC on the seed's rows. Each call
--   must fail, or change nothing and return nothing.
--
-- The catalog checks force the matrix to grow with the schema: every table
-- needs an ownership rule and at least one row, and every client RPC needs a
-- call here (or to be on the reviewed list of RPCs scoped to the caller).
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

create schema tests;
grant usage on schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: the outsiders and a row in every table the seed leaves empty
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('b2400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'xavier@fuera.test', now(),
   '{"role": "shipper"}', now(), now()),
  ('b2400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'yolanda@fuera.test', now(),
   '{"role": "carrier"}', now(), now()),
  ('b2400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'zoe@fuera.test', now(),
   '{"role": "operator"}', now(), now()),
  -- An operator account without a company yet (invitations are bound to an email).
  ('b2400000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'walter@fuera.test', now(),
   '{"role": "operator"}', now(), now());
insert into public.companies (id, type, legal_name, rfc, status) values
  ('c2400000-0000-4000-8000-000000000001', 'shipper', 'Envíos Ajenos, S.A. de C.V.', 'EAJ150301KQ3', 'approved'),
  ('c2400000-0000-4000-8000-000000000002', 'carrier', 'Fletes Ajenos, S.A. de C.V.', 'FAJ150301KQ4', 'approved');
update public.profiles set company_id = 'c2400000-0000-4000-8000-000000000001'
where id = 'b2400000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c2400000-0000-4000-8000-000000000002'
where id in ('b2400000-0000-4000-8000-000000000002', 'b2400000-0000-4000-8000-000000000003');
insert into public.operators (id, company_id, profile_id, full_name) values
  ('d2400000-0000-4000-8000-000000000003', 'c2400000-0000-4000-8000-000000000002',
   'b2400000-0000-4000-8000-000000000003', 'Zoé Ajena');

-- Seed rows used below. T1: trip in unloading (shipper Aceros del Norte,
-- carrier Transportes Regios del Norte, operator Pedro López).
create table tests.vals (name text primary key, id uuid);
insert into tests.vals values
  ('trip', '5eed0008-0000-4000-8000-000000000001'),
  ('vehicle', '5eed0004-0000-4000-8000-000000000002'),
  ('operator', '5eed0003-0000-4000-8000-000000000001'),
  ('operator_without_account', '5eed0003-0000-4000-8000-000000000003'),
  ('shipper_company', '5eed0002-0000-4000-8000-000000000001'),
  ('carrier_company', '5eed0002-0000-4000-8000-000000000004');
insert into tests.vals
select 'trip_conversation', id from public.conversations where trip_id = '5eed0008-0000-4000-8000-000000000001';
insert into tests.vals
select 'negotiation_conversation', id from public.conversations where kind = 'negotiation' order by id limit 1;
insert into tests.vals select 'document', id from public.documents order by id limit 1;
insert into tests.vals select 'pending_document', id from public.documents where status = 'pending_review' limit 1;
insert into tests.vals select 'draft_load', id from public.loads where status = 'draft' limit 1;
insert into tests.vals select 'open_load', id from public.loads where status = 'published' order by id limit 1;
insert into tests.vals select 'negotiating_load', id from public.loads where status = 'negotiating' order by id limit 1;
insert into tests.vals select 'contracted_load', id from public.loads where status = 'contracted' limit 1;
insert into tests.vals select 'pending_offer', id from public.offers where status = 'pending' order by id limit 1;
insert into tests.vals select 'availability', id from public.vehicle_availability order by id limit 1;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;
grant select on tests.vals to anon, authenticated;

insert into public.audit_log (actor_id, action, table_name, record_id, company_id)
values ('5eed0001-0000-4000-8000-000000000001', 'update', 'companies',
        tests.val('carrier_company'), tests.val('carrier_company'));
insert into public.document_expiry_notices (document_id, threshold_days, expires_at)
values (tests.val('document'), 30, now() + interval '30 days');
insert into public.incidents (id, trip_id, kind, description, occurred_at, reported_by, reporter_role)
values ('e2400000-0000-4000-8000-000000000001', tests.val('trip'), 'delay', 'Tráfico en la caseta', now(),
        '5eed0001-0000-4000-8000-000000000008', 'operator');
insert into tests.vals values ('incident', 'e2400000-0000-4000-8000-000000000001');
insert into public.location_consents (user_id, policy_version, platform)
values ('5eed0001-0000-4000-8000-000000000008', '2026-10-01', 'android');
insert into public.message_reads (conversation_id, user_id, last_read_at)
values (tests.val('trip_conversation'), '5eed0001-0000-4000-8000-000000000002', now());
insert into public.operator_invitations (id, company_id, operator_id, email, code_hash, expires_at)
values ('f2400000-0000-4000-8000-000000000001', tests.val('carrier_company'), tests.val('operator_without_account'),
        -- Hash of the normalized code (accept_operator_invitation drops
        -- spaces and dashes and upper-cases it).
        'zoe@fuera.test', sha256(convert_to('B24INVITECODE', 'UTF8')), now() + interval '1 day');
insert into tests.vals values ('invitation', 'f2400000-0000-4000-8000-000000000001');
insert into public.push_tokens (user_id, token, platform)
values ('5eed0001-0000-4000-8000-000000000008', 'ExponentPushToken[b24SeedDeviceToken]', 'android');
insert into public.route_distance_cache (origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_minutes)
values (25.69, -100.32, 20.66, -103.35, 820, 540);
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('documents', tests.val('carrier_company') || '/company/' || tests.val('carrier_company')
                || '/a2400000-0000-4000-8000-000000000001.pdf',
   '5eed0001-0000-4000-8000-000000000005', '{"mimetype": "application/pdf", "size": 2048}'),
  ('evidence', tests.val('trip') || '/delivery/a2400000-0000-4000-8000-000000000002.jpg',
   '5eed0001-0000-4000-8000-000000000008', '{"mimetype": "image/jpeg", "size": 2048}'),
  ('trip-documents', tests.val('trip') || '/a2400000-0000-4000-8000-000000000003.pdf',
   '5eed0001-0000-4000-8000-000000000005', '{"mimetype": "application/pdf", "size": 2048}'),
  ('chat', tests.val('trip_conversation') || '/a2400000-0000-4000-8000-000000000004.jpg',
   '5eed0001-0000-4000-8000-000000000002', '{"mimetype": "image/jpeg", "size": 2048}');
insert into public.trip_evidence (trip_id, stage, storage_path, sha256, captured_at, uploaded_by)
values (tests.val('trip'), 'delivery', tests.val('trip') || '/delivery/a2400000-0000-4000-8000-000000000002.jpg',
        repeat('ab', 32), now(), '5eed0001-0000-4000-8000-000000000008');
insert into public.trip_documents (trip_id, kind, storage_path, file_name, uploaded_by)
values (tests.val('trip'), 'carta_porte', tests.val('trip') || '/a2400000-0000-4000-8000-000000000003.pdf',
        'carta-porte.pdf', '5eed0001-0000-4000-8000-000000000005');
insert into public.rate_limit_counters (bucket, subject, window_start, hits)
values ('recommendations', '5eed0001-0000-4000-8000-000000000005', now(), 1);
insert into public.product_events (name, user_id, user_role, company_id, properties)
values ('recommendations_viewed', '5eed0001-0000-4000-8000-000000000005', 'carrier', tests.val('carrier_company'),
        '{"recommendations": 3}');

-- ---------------------------------------------------------------------------
-- Ownership: when a row belongs to company $1 / user $2 (evaluated as the
-- database owner, so the joins do not depend on the caller's RLS).
-- ---------------------------------------------------------------------------
create table tests.ownership (tbl text primary key, owned text not null);
insert into tests.ownership values
  -- Admin only, service role only, or reachable only through RPCs.
  ('public.audit_log', 'false'),
  ('public.document_expiry_notices', 'false'),
  ('public.route_distance_cache', 'false'),
  ('public.rate_limit_counters', 'false'),
  ('public.product_events', 'false'),
  -- Catalogs every signed-in user reads.
  ('public.document_requirements', 'true'),
  ('public.trip_evidence_requirements', 'true'),
  -- Company data.
  ('public.companies', 't.id = $1'),
  ('public.profiles', 't.company_id = $1 or t.id = $2'),
  ('public.documents', 't.company_id = $1'),
  ('public.vehicles', 't.company_id = $1'),
  ('public.operators', 't.company_id = $1'),
  ('public.operator_invitations', 't.company_id = $1'),
  ('public.carrier_routes', 't.company_id = $1'),
  ('public.vehicle_availability', 't.company_id = $1'),
  -- Marketplace: open loads are visible to approved carriers.
  ('public.loads', $$
     $1 in (t.shipper_company_id, t.carrier_company_id)
     or exists (select 1 from public.negotiations n where n.load_id = t.id and n.carrier_company_id = $1)
     or (t.status in ('published', 'negotiating') and t.archived_at is null
         and exists (select 1 from public.companies c
                     where c.id = $1 and c.type = 'carrier' and c.status = 'approved' and c.archived_at is null))
  $$),
  ('public.negotiations', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.offers', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.trips', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.conversations', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  -- Children of a trip or a conversation: parties of the parent.
  ('public.trip_events', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  ('public.trip_evidence', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  ('public.trip_documents', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  ('public.incidents', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  -- The shipper sees the GPS track only while the trip is active.
  ('public.trip_locations', $$
     exists (select 1 from public.trips x where x.id = t.trip_id
             and (x.carrier_company_id = $1 or (x.shipper_company_id = $1 and public.trip_is_active(x.status))))
  $$),
  ('public.messages', 'exists (select 1 from public.conversations x where x.id = t.conversation_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  ('public.message_reads', 'exists (select 1 from public.conversations x where x.id = t.conversation_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  -- Personal rows.
  ('public.notifications', 't.user_id = $2'),
  ('public.push_tokens', 't.user_id = $2'),
  ('public.location_consents', 't.user_id = $2'),
  -- Files: by the first segment of the path.
  ('storage.objects', $$
     case t.bucket_id
       when 'documents' then split_part(t.name, '/', 1) = $1::text
       when 'evidence' then exists (select 1 from public.trips x where x.id::text = split_part(t.name, '/', 1)
                                    and $1 in (x.shipper_company_id, x.carrier_company_id))
       when 'trip-documents' then exists (select 1 from public.trips x where x.id::text = split_part(t.name, '/', 1)
                                          and $1 in (x.shipper_company_id, x.carrier_company_id))
       when 'chat' then exists (select 1 from public.conversations x where x.id::text = split_part(t.name, '/', 1)
                                and $1 in (x.shipper_company_id, x.carrier_company_id))
       else false
     end
  $$);

select set_eq(
  $$ select tbl from tests.ownership where tbl like 'public.%' $$,
  $$ select 'public.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'spatial_ref_sys' $$,
  'every table in public has an ownership rule in the matrix'
);

create function tests.empty_tables()
returns setof text
language plpgsql
as $$
declare
  v_tbl text;
  v_any boolean;
begin
  for v_tbl in select tbl from tests.ownership order by tbl loop
    execute format('select exists (select 1 from %s)', v_tbl) into v_any;
    if not v_any then
      return next v_tbl;
    end if;
  end loop;
end;
$$;

select is_empty($$ select * from tests.empty_tables() $$, 'every table of the matrix has rows to leak');

-- ---------------------------------------------------------------------------
-- Read and update matrix
-- ---------------------------------------------------------------------------

-- Acts as p_uid (role authenticated, or anon when p_uid is null).
create function tests.act_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{"role": "anon"}'
         else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
end;
$$;

-- Primary key of a table as a text expression over alias t: the identity of
-- a row both for the caller (who may only read some columns) and the owner.
create function tests.row_key(p_tbl text)
returns text
language sql
stable
as $$
  select 'row(' || string_agg(format('t.%I', a.attname), ', ' order by k.ord) || ')::text'
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = p_tbl::regclass and i.indisprimary;
$$;

select is_empty(
  $$ select tbl from tests.ownership where tests.row_key(tbl) is null $$,
  'every table of the matrix has a primary key to identify rows'
);

-- Rows (by key) that do not belong to p_uid, as "table: n rows".
create function tests.foreign_rows(p_uid uuid, p_tbl text, p_keys text[])
returns text
language plpgsql
as $$
declare
  v_owned text := (select owned from tests.ownership where tbl = p_tbl);
  v_company uuid := (select company_id from public.profiles where id = p_uid);
  v_count bigint;
begin
  execute format('select count(*) from %s t where %s = any ($3) and not coalesce((%s), false)',
                 p_tbl, tests.row_key(p_tbl), v_owned)
  into v_count using v_company, p_uid, p_keys;
  return case when v_count > 0 then format('%s: %s rows', p_tbl, v_count) end;
end;
$$;

create function tests.read_leaks(p_uid uuid)
returns setof text
language plpgsql
as $$
declare
  v_tbl text;
  v_keys text[];
  v_leak text;
begin
  for v_tbl in select tbl from tests.ownership order by tbl loop
    v_keys := null;
    -- Without any privilege the table is closed; otherwise every error counts.
    if has_any_column_privilege(case when p_uid is null then 'anon' else 'authenticated' end, v_tbl, 'select') then
      perform tests.act_as(p_uid);
      execute format('select array_agg(%s) from %s t', tests.row_key(v_tbl), v_tbl) into v_keys;
      reset role;
    end if;
    v_leak := tests.foreign_rows(p_uid, v_tbl, v_keys);
    if v_leak is not null then
      return next v_leak;
    end if;
  end loop;
end;
$$;

-- Each update is rolled back (the block raises after counting).
create function tests.update_leaks(p_uid uuid)
returns setof text
language plpgsql
as $$
declare
  r record;
  v_keys text[];
  v_leak text;
begin
  for r in
    select 'public.' || table_name as tbl, min(column_name::text) as col
    from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
    group by table_name order by table_name
  loop
    v_leak := null;
    begin
      perform tests.act_as(p_uid);
      execute format('with u as (update %s t set %I = t.%I returning %s as k) select array_agg(k) from u',
                     r.tbl, r.col, r.col, tests.row_key(r.tbl))
      into v_keys;
      reset role;
      v_leak := tests.foreign_rows(p_uid, r.tbl, v_keys);
      raise exception 'b24_rollback';
    exception
      when insufficient_privilege then
        v_leak := null;
      when others then
        if sqlerrm <> 'b24_rollback' then
          raise;
        end if;
    end;
    reset role;
    if v_leak is not null then
      return next v_leak;
    end if;
  end loop;
end;
$$;

create table tests.personas (uid uuid, label text);
insert into tests.personas
select p.id, p.role || ' ' || coalesce(u.email, '')
from public.profiles p join auth.users u on u.id = p.id
where p.role <> 'admin';

select is_empty(
  format($$ select * from tests.read_leaks(%L) $$, uid),
  'read: ' || label || ' only sees rows of their company'
)
from tests.personas order by uid;

select is_empty($$ select * from tests.read_leaks(null) $$, 'read: anon sees nothing');

select is_empty(
  $$ select p.label || ' -> ' || l from tests.personas p cross join lateral tests.update_leaks(p.uid) l $$,
  'update: no user updates rows of another company'
);

-- ---------------------------------------------------------------------------
-- RPC matrix: the outsiders on the seed's rows
-- ---------------------------------------------------------------------------
create table tests.rpc_calls (fn text, call text);
insert into tests.rpc_calls values
  ('submit_document', $$ public.submit_document((select id from public.document_requirements where owner_type = 'company' limit 1),
       'company', tests.val('carrier_company'),
       tests.val('carrier_company') || '/company/' || tests.val('carrier_company') || '/a2400000-0000-4000-8000-000000000001.pdf',
       'acta.pdf', now() + interval '1 year') $$),
  ('review_document', $$ public.review_document(tests.val('pending_document'), 'approve', null, now() + interval '1 year') $$),
  ('review_company', $$ public.review_company(tests.val('carrier_company'), 'suspend', 'x') $$),
  ('admin_list_users', $$ (select count(*) from public.admin_list_users(null, 50, 0)) $$),
  ('create_operator_invitation', $$ (select count(*) from public.create_operator_invitation(tests.val('operator_without_account'), 24)) $$),
  ('revoke_operator_invitation', $$ public.revoke_operator_invitation(tests.val('invitation')) $$),
  ('accept_operator_invitation', $$ public.accept_operator_invitation('B24-INVITE-CODE') $$),
  ('set_vehicle_availability', $$ public.set_vehicle_availability(tests.val('vehicle'), now() + interval '1 hour',
       25.69, -100.32, 'Monterrey', 'Nuevo León') $$),
  ('clear_vehicle_availability', $$ public.clear_vehicle_availability(tests.val('vehicle')) $$),
  ('update_load', $$ public.update_load(tests.val('draft_load'), '{"description": "Cambiada"}') $$),
  ('publish_load', $$ public.publish_load(tests.val('draft_load')) $$),
  ('cancel_load', $$ public.cancel_load(tests.val('open_load'), 'x') $$),
  ('make_offer', $$ public.make_offer(tests.val('contracted_load'), 3000000, null, null) $$),
  ('counter_offer', $$ public.counter_offer(tests.val('pending_offer'), 3100000, null, null) $$),
  ('reject_offer', $$ public.reject_offer(tests.val('pending_offer'), 'x') $$),
  ('withdraw_offer', $$ public.withdraw_offer(tests.val('pending_offer')) $$),
  ('accept_offer', $$ public.accept_offer(tests.val('pending_offer')) $$),
  ('admin_create_offer', $$ public.admin_create_offer(tests.val('open_load'), 'c2400000-0000-4000-8000-000000000002',
       3000000, null, null, true) $$),
  ('admin_accept_offer', $$ public.admin_accept_offer(tests.val('pending_offer')) $$),
  ('load_negotiation_carriers', $$ (select count(*) from public.load_negotiation_carriers(tests.val('negotiating_load'))) $$),
  ('load_offer_vehicles', $$ (select count(*) from public.load_offer_vehicles(tests.val('negotiating_load'))) $$),
  ('match_candidates', $$ (select count(*) from public.match_candidates(tests.val('vehicle'), null, 500, 50)) $$),
  ('match_candidates', $$ (select count(*) from public.match_candidates(null, tests.val('availability'), 500, 50)) $$),
  ('assign_trip', $$ public.assign_trip(tests.val('trip'), tests.val('vehicle'), tests.val('operator')) $$),
  ('record_trip_event', $$ public.record_trip_event(tests.val('trip'), 'unloading_finished', now(), 20.66, -103.35,
       10, null, null, null, null) $$),
  ('set_estimated_unload_end', $$ public.set_estimated_unload_end(tests.val('trip'), now() + interval '2 hours', now(), null) $$),
  ('record_trip_locations', $$ public.record_trip_locations(tests.val('trip'),
       jsonb_build_array(jsonb_build_object('recordedAt', now(), 'lat', 20.66, 'lng', -103.35))) $$),
  ('add_trip_evidence', $$ public.add_trip_evidence(tests.val('trip'), 'delivery',
       tests.val('trip') || '/delivery/a2400000-0000-4000-8000-000000000002.jpg', repeat('cd', 32), now(), null, null, null) $$),
  ('confirm_delivery', $$ public.confirm_delivery(tests.val('trip'), 'Recibió Juan') $$),
  ('cancel_trip', $$ public.cancel_trip(tests.val('trip'), 'x') $$),
  ('report_incident', $$ public.report_incident(tests.val('trip'), 'delay', 'x', now(), null, null) $$),
  ('resolve_incident', $$ public.resolve_incident(tests.val('incident'), 'x') $$),
  ('trip_point_locations', $$ (select count(*) from public.trip_point_locations(tests.val('trip'))) $$),
  ('add_trip_document', $$ public.add_trip_document(tests.val('trip'), 'carta_porte',
       tests.val('trip') || '/a2400000-0000-4000-8000-000000000003.pdf', 'carta.pdf') $$),
  ('shipper_trip_parties', $$ (select count(*) from public.shipper_trip_parties(array[tests.val('trip')])) $$),
  ('send_message', $$ public.send_message(tests.val('trip_conversation'), 'hola', '[]', null) $$),
  ('send_message', $$ public.send_message(tests.val('negotiation_conversation'), 'hola', '[]', null) $$),
  ('mark_conversation_read', $$ public.mark_conversation_read(tests.val('trip_conversation'), null) $$),
  ('is_conversation_participant', $$ public.is_conversation_participant(tests.val('trip_conversation')) $$),
  ('unregister_push_token', $$ public.unregister_push_token('ExponentPushToken[b24SeedDeviceToken]') $$),
  ('mark_notifications_read', $$ public.mark_notifications_read(array(select id from tests.foreign_notifications)) $$);

-- The seed's notifications, captured as the owner: the outsider cannot read
-- them (notifications_select_own), so the call must get their ids from here.
create table tests.foreign_notifications as
  select id from public.notifications where user_id::text not like 'b2400000-%';
grant select on tests.foreign_notifications to authenticated;
select ok(
  exists (select 1 from tests.foreign_notifications where id is not null),
  'the RPC matrix has notifications of other users to mark'
);

-- RPCs without a foreign target: they act on the caller's own rows only
-- (reviewed in docs/seguridad.md). register_push_token reassigns a token to
-- the device's current user by design.
create table tests.self_scoped (fn text);
insert into tests.self_scoped values
  ('auth_role'), ('auth_company_id'), ('auth_shipper_company_id'), ('auth_fleet_company_id'), ('auth_operator_id'),
  ('is_admin'), ('is_company_approved'), ('has_location_consent'), ('create_company'), ('request_company_review'),
  ('create_load'), ('record_location_consent'), ('revoke_location_consent'), ('register_push_token'),
  ('consume_rate_limit'), ('track_product_event');

select set_eq(
  $$ select fn from tests.rpc_calls union select fn from tests.self_scoped $$,
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'every client RPC is in the RPC matrix or on the reviewed self-scoped list'
);

-- Fingerprint of every table of the matrix (as the database owner).
create function tests.db_hash()
returns text
language plpgsql
as $$
declare
  v_tbl text;
  v_part text;
  v_all text := '';
begin
  for v_tbl in select tbl from tests.ownership order by tbl loop
    execute format('select md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from %s x', ',', '', v_tbl)
    into v_part;
    v_all := v_all || v_part;
  end loop;
  return md5(v_all);
end;
$$;

-- Calls that succeeded and changed data or returned something. Each call is
-- rolled back.
create function tests.rpc_breaches(p_uid uuid)
returns setof text
language plpgsql
as $$
declare
  r record;
  v_before text;
  v_result text;
  v_breach text;
begin
  for r in select fn, call from tests.rpc_calls order by fn, call loop
    v_breach := null;
    v_before := tests.db_hash();
    begin
      perform tests.act_as(p_uid);
      execute format('select (%s)::text', r.call) into v_result;
      reset role;
      if tests.db_hash() <> v_before then
        v_breach := r.fn || ' changed data';
      elsif coalesce(v_result, '') not in ('', 'false', '0') then
        v_breach := r.fn || ' returned ' || left(v_result, 80);
      end if;
      raise exception 'b24_rollback';
    exception
      -- The expected refusal.
      when insufficient_privilege then
        v_breach := null;
      when others then
        -- Any other error (a missing function, a wrong argument, a broken
        -- fixture) means the call never reached its access check: report it
        -- instead of counting it as a refusal.
        if sqlerrm <> 'b24_rollback' then
          v_breach := r.fn || ' failed with ' || sqlstate || ' instead of 42501: ' || left(sqlerrm, 80);
        end if;
    end;
    reset role;
    if v_breach is not null then
      return next v_breach;
    end if;
  end loop;
end;
$$;

select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000001') $$,
  'RPCs: an outsider shipper cannot act on or read the seed''s rows');
select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000002') $$,
  'RPCs: an outsider carrier cannot act on or read the seed''s rows');
select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000003') $$,
  'RPCs: an outsider operator cannot act on or read the seed''s rows');
select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000004') $$,
  'RPCs: an operator without a company cannot act on or read the seed''s rows (nor take someone else''s invitation)');

-- Sanity check of the harness: the same call by the right party does change
-- data, so a refusal above is not an artifact of the fixtures.
create function tests.changes_data(p_uid uuid, p_call text)
returns boolean
language plpgsql
as $$
declare
  v_before text := tests.db_hash();
  v_changed boolean;
begin
  begin
    perform tests.act_as(p_uid);
    execute format('select (%s)::text', p_call);
    reset role;
    v_changed := tests.db_hash() <> v_before;
    raise exception 'b24_rollback';
  exception when others then
    if sqlerrm <> 'b24_rollback' then
      raise;
    end if;
  end;
  reset role;
  return v_changed;
end;
$$;

select ok(
  tests.changes_data('5eed0001-0000-4000-8000-000000000008', (select call from tests.rpc_calls where fn = 'report_incident')),
  'harness: the trip''s operator can report the incident the outsiders could not'
);

select * from finish();
rollback;
