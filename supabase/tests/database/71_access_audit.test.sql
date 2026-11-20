-- S1 · Auditoría de D48 (plan-acceso.md §S1). The web is about to let an
-- account into /cliente and /transportista before its company is approved
-- (or registered). This suite proves that the screens can open without the
-- database giving anything away: every action that commits someone else
-- keeps asking for an approved company in Postgres, for each state that is
-- not `approved` (pending_review, rejected, expired, suspended), and an
-- account without a company reads and writes nothing of anyone else.
--
-- Blocked while the company is not approved (one test per action and state):
--   shipper: publish_load, update_load of a published load,
--            request_brokered_load, approve_brokered_quote, accept_offer,
--            counter_offer;
--   carrier: reading published loads (RLS), make_offer, accept_offer,
--            counter_offer, assign_trip, match_candidates, load_match
--            notifications (match_pairs), create_share_link (load_internal),
--            the offer of a team link (open_internal_share);
--   both:    changing the status of the own company.
-- Allowed on purpose (D48: what commits nobody): a shipper's drafts
-- (create_load, update_load) and the carrier's fleet (business units, units,
-- operators, invitations, availability of a unit).
begin;
create extension if not exists pgtap with schema extensions;

select plan(147);

-- I1 and R3: the cargo insurance and the operator's selfie take no part here.
update public.trip_document_requirements set is_required = false, blocks_departure = false where kind = 'cargo_insurance';
update public.document_requirements set is_required = false where code = 'operator_selfie';

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@d48.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000', 'full_name', 'Prueba ' || p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

-- A valid load payload MTY -> GDL (loadFormSchema output).
create function tests.payload(p_days integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + make_interval(days => p_days),
                                       'end', now() + make_interval(days => p_days, hours => 4)),
    'deliveryWindow', jsonb_build_object('start', now() + make_interval(days => p_days + 1),
                                         'end', now() + make_interval(days => p_days + 1, hours => 6)),
    'cargoType', 'palletized',
    'description', 'Tarimas',
    'weightKg', 18000,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(),
    'proposedPriceCents', 3500000
  );
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to authenticated;

-- An approved, current document of the owner (what review_document leaves).
create function tests.doc(p_owner_type public.document_owner_type, p_owner_id uuid, p_code text)
returns uuid
language sql
as $$
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select public.document_owner_company_id(p_owner_type, p_owner_id),
         (select id from public.document_requirements where code = p_code), p_owner_type, p_owner_id,
         public.document_owner_company_id(p_owner_type, p_owner_id) || '/' || p_owner_type || '/' || p_owner_id || '/'
           || gen_random_uuid() || '.pdf',
         'approved', now() + interval '1 year'
  returning id;
$$;

-- The state of the two companies under test, set as the owner of the tables
-- (what review_company, the expiry job or the admin would leave).
create function tests.set_status(p_status public.verification_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.companies
  set status = p_status,
      status_reason = case when p_status in ('rejected', 'suspended') then 'Motivo de prueba' end
  where id in ('c7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002');
$$;

-- load_match notifications of a user for a load, read as the owner.
create function tests.match_notices(p_user uuid, p_load uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.notifications n
  where n.user_id = p_user and n.type = 'load_match' and n.data ->> 'loadId' = p_load::text;
$$;

-- Every table of `public` the caller can read a row of, with how many.
create function tests.visible_rows()
returns table (relation text, visible bigint)
language plpgsql
as $$
declare
  v_table record;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and c.relname <> 'spatial_ref_sys'
    order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I', v_table.relname) into visible;
    exception when insufficient_privilege then
      visible := 0;
    end;
    if visible > 0 then
      relation := v_table.relname;
      return next;
    end if;
  end loop;
end;
$$;

-- One test per blocked action, for a state that is not `approved`.
create function tests.audit(p_status public.verification_status)
returns setof text
language plpgsql
as $$
declare
  v_load uuid;
begin
  perform tests.set_status(p_status);

  -- The shipper.
  perform tests.login('a7100000-0000-4000-8000-000000000001');
  return next throws_ok(
    $q$ select public.publish_load(tests.val('sara_draft')) $q$,
    '42501', 'company is not approved', p_status || ': the shipper does not publish a draft');
  return next throws_ok(
    $q$ select public.update_load(tests.val('sara_published'), tests.payload(9)) $q$,
    '42501', 'company is not approved', p_status || ': the shipper does not change a published load');
  return next throws_ok(
    $q$ select public.request_brokered_load(tests.payload(9), 3000000) $q$,
    '42501', 'company is not approved', p_status || ': the shipper does not send a load to Transport');
  return next throws_ok(
    $q$ select public.approve_brokered_quote(tests.val('sara_brokered'), 3000000) $q$,
    '42501', 'company is not approved', p_status || ': the shipper does not publish a brokered load');
  return next throws_ok(
    $q$ select public.accept_offer(tests.val('marta_offer')) $q$,
    '42501', 'company is not approved', p_status || ': the shipper does not accept an offer');
  return next throws_ok(
    $q$ select public.counter_offer(tests.val('marta_offer'), 3100000) $q$,
    '42501', 'company is not approved', p_status || ': the shipper does not counter an offer');
  return next throws_ok(
    $q$ update public.companies set status = 'approved' where id = 'c7100000-0000-4000-8000-000000000001' $q$,
    '42501', null, p_status || ': the shipper cannot change the status of their company');
  -- D48: what commits nobody stays open.
  return next lives_ok(
    $q$ select public.update_load(public.create_load(tests.payload(10)), tests.payload(11)) $q$,
    p_status || ': the shipper creates and edits drafts');

  -- The carrier.
  perform tests.login('a7100000-0000-4000-8000-000000000002');
  return next is(
    (select count(*)::int from public.loads where id = tests.val('silvia_published')), 0,
    p_status || ': the carrier does not read published loads');
  return next throws_ok(
    $q$ select public.make_offer(tests.val('silvia_published'), 3000000, null, 'e7100000-0000-4000-8000-000000000001') $q$,
    '42501', 'company is not approved', p_status || ': the carrier does not make an offer');
  return next throws_ok(
    $q$ select public.accept_offer(tests.val('silvia_counter')) $q$,
    '42501', 'company is not approved', p_status || ': the carrier does not accept a counter-offer');
  return next throws_ok(
    $q$ select public.counter_offer(tests.val('silvia_counter'), 3100000) $q$,
    '42501', 'company is not approved', p_status || ': the carrier does not counter an offer');
  return next throws_ok(
    $q$ select public.assign_trip(tests.val('mario_trip'), 'e7100000-0000-4000-8000-000000000001',
                                  'd7100000-0000-4000-8000-000000000006') $q$,
    '42501', 'company is not approved', p_status || ': the carrier does not assign a trip');
  return next throws_ok(
    $q$ select * from public.match_candidates('e7100000-0000-4000-8000-000000000003') $q$,
    '42501', 'company is not approved', p_status || ': the carrier gets no recommendations');
  return next throws_ok(
    $q$ select * from public.create_share_link('load_internal', tests.val('silvia_published')) $q$,
    '42501', 'load not found', p_status || ': the carrier does not share a load with the team');
  return next is(
    public.open_internal_share((select token from tests.tokens where name = 'mario_share')) -> 'canOffer', 'false'::jsonb,
    p_status || ': a team link from before opens without the way to offer');
  return next throws_ok(
    $q$ update public.companies set status = 'approved' where id = 'c7100000-0000-4000-8000-000000000002' $q$,
    '42501', null, p_status || ': the carrier cannot change the status of their company');
  -- D48: the fleet is prepared before the approval.
  return next lives_ok(
    $q$ select public.create_business_unit('Bajío ' || gen_random_uuid());
        insert into public.vehicles (company_id, business_unit_id, kind, plate, unit_type, capacity_kg)
        values ('c7100000-0000-4000-8000-000000000002', tests.val('mario_unit'), 'trailer',
                'D48' || upper(substr(md5(random()::text), 1, 4)), 'dry_van', 20000);
        insert into public.operators (company_id, business_unit_id, full_name)
        values ('c7100000-0000-4000-8000-000000000002', tests.val('mario_unit'), 'Nuevo Operador');
        select * from public.create_invitation('operator', array[tests.val('mario_unit')], null, 'Invitado', 168, '8122223333');
        select public.set_vehicle_availability('e7100000-0000-4000-8000-000000000003', now(), 25.6866, -100.3161,
                                               'Monterrey', 'Nuevo León') $q$,
    p_status || ': the carrier prepares its fleet (business unit, unit, operator, invitation, availability)');

  -- A load published now recommends nothing to the carrier (match_pairs).
  perform tests.login('a7100000-0000-4000-8000-000000000004');
  v_load := public.create_load(tests.payload(1));
  perform public.publish_load(v_load);
  return next is(
    tests.match_notices('a7100000-0000-4000-8000-000000000002', v_load), 0,
    p_status || ': the carrier is not recommended a new load, even with a free unit');
  return;
end;
$$;

-- An account without a company: what it reads and what it cannot write.
create function tests.audit_without_company(p_user uuid, p_who text)
returns setof text
language plpgsql
as $$
declare
  v_changed integer;
begin
  perform tests.login(p_user);
  -- Reads: the own profile and the catalogs everyone signed in reads; no row
  -- of a company, a load, a unit, a document, a trip or a notification.
  return next is_empty(
    $q$ select relation from tests.visible_rows()
        where relation <> all (array[
          'profiles', 'document_requirements', 'license_unit_compatibility', 'platform_settings',
          'trip_document_requirements', 'trip_evidence_requirements', 'subscription_plans',
          'road_corridors', 'road_corridor_segments', 'road_segments', 'road_segment_tolls', 'road_segment_risks'
        ]) $q$,
    p_who || ' without a company reads only their profile and the catalogs every account reads');
  return next results_eq(
    $q$ select id from public.profiles $q$, array[p_user],
    p_who || ' without a company reads no profile but their own');
  return next is(
    (select count(*)::int from public.client_loads()), 0,
    p_who || ' without a company lists no loads');

  -- Writes: nothing of another company, nothing that needs one.
  return next throws_ok(
    $q$ select public.create_load(tests.payload(2)) $q$,
    '42501', 'only shippers can create loads', p_who || ' without a company creates no load');
  return next throws_ok(
    $q$ select public.publish_load(tests.val('silvia_published')) $q$,
    '42501', 'load not found', p_who || ' without a company publishes nothing');
  return next throws_ok(
    $q$ select public.cancel_load(tests.val('silvia_published')) $q$,
    '42501', null, p_who || ' without a company cancels no load');
  return next throws_ok(
    $q$ select public.request_brokered_load(tests.payload(2), 3000000) $q$,
    '42501', 'only shippers can create loads', p_who || ' without a company sends no load to Transport');
  return next throws_ok(
    $q$ select public.make_offer(tests.val('silvia_published'), 3000000, null, 'e7100000-0000-4000-8000-000000000001') $q$,
    '42501', null, p_who || ' without a company makes no offer');
  return next throws_ok(
    $q$ select public.accept_offer(tests.val('silvia_counter')) $q$,
    '42501', 'offer not found', p_who || ' without a company accepts no offer');
  return next throws_ok(
    $q$ select public.counter_offer(tests.val('marta_offer'), 3100000) $q$,
    '42501', 'offer not found', p_who || ' without a company counters no offer');
  return next throws_ok(
    $q$ select public.assign_trip(tests.val('mario_trip'), 'e7100000-0000-4000-8000-000000000001',
                                  'd7100000-0000-4000-8000-000000000006') $q$,
    '42501', null, p_who || ' without a company assigns no trip');
  return next throws_ok(
    $q$ select * from public.match_candidates('e7100000-0000-4000-8000-000000000003') $q$,
    '42501', null, p_who || ' without a company gets no recommendations');
  return next throws_ok(
    $q$ select public.set_vehicle_availability('e7100000-0000-4000-8000-000000000001', now(), 25.6866, -100.3161,
                                               'Monterrey', 'Nuevo León') $q$,
    '42501', 'vehicle not found', p_who || ' without a company moves no unit');
  return next throws_ok(
    $q$ insert into public.vehicles (company_id, kind, plate, unit_type, capacity_kg)
        values ('c7100000-0000-4000-8000-000000000002', 'trailer', 'INTRUSO1', 'dry_van', 20000) $q$,
    '42501', null, p_who || ' without a company adds no unit to another company');
  return next throws_ok(
    $q$ insert into public.operators (company_id, full_name)
        values ('c7100000-0000-4000-8000-000000000002', 'Intruso') $q$,
    '42501', null, p_who || ' without a company adds no operator to another company');
  return next throws_ok(
    $q$ select public.create_business_unit('Intrusa') $q$,
    '42501', null, p_who || ' without a company creates no business unit');
  return next throws_ok(
    $q$ select * from public.create_invitation('operator', array[tests.val('mario_unit')]) $q$,
    '42501', 'only the staff of a carrier company can invite', p_who || ' without a company invites nobody');
  return next throws_ok(
    $q$ select public.submit_document(
          (select id from public.document_requirements where code = 'tax_status_certificate'), 'company',
          'c7100000-0000-4000-8000-000000000002',
          'c7100000-0000-4000-8000-000000000002/company/c7100000-0000-4000-8000-000000000002/'
            || gen_random_uuid() || '.pdf') $q$,
    '42501', 'caller has no active company', p_who || ' without a company submits no document');
  return next throws_ok(
    $q$ select public.request_company_review() $q$,
    '42501', null, p_who || ' without a company asks for no review');
  return next throws_ok(
    $q$ select * from public.create_share_link('load_public', tests.val('silvia_published')) $q$,
    '42501', 'load not found', p_who || ' without a company shares no load');
  update public.companies set contact_name = 'Intruso'
  where id in ('c7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000003');
  get diagnostics v_changed = row_count;
  return next is(v_changed, 0, p_who || ' without a company changes no company');
  return;
end;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a71…: 01 Sara (shipper under test), 02 Mario (manager of the carrier under test), 03 admin,
-- 04 Silvia (approved shipper, counterparty), 05 Marta (manager of an approved carrier, counterparty),
-- 06 Omar (operator of Mario), 07 shipper without a company, 08 manager without a company,
-- 09 coordinator without a company, 0a Olga (operator of Marta).
select tests.new_user('a7100000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a7100000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a7100000-0000-4000-8000-000000000003', 'shipper');
select tests.new_user('a7100000-0000-4000-8000-000000000004', 'shipper');
select tests.new_user('a7100000-0000-4000-8000-000000000005', 'manager');
select tests.new_user('a7100000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a7100000-0000-4000-8000-000000000007', 'shipper');
select tests.new_user('a7100000-0000-4000-8000-000000000008', 'manager');
select tests.new_user('a7100000-0000-4000-8000-000000000009', 'coordinator');
select tests.new_user('a7100000-0000-4000-8000-00000000000a', 'operator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c7100000-0000-4000-8000-000000000001', 'shipper', 'Envíos D48 SA de CV', 'EDC050505GH5', 'approved'),
  ('c7100000-0000-4000-8000-000000000002', 'carrier', 'Fletes D48 SA de CV', 'FDC040404CD4', 'approved'),
  ('c7100000-0000-4000-8000-000000000003', 'shipper', 'Cargas Silvia SA de CV', 'CSI030303EF3', 'approved'),
  ('c7100000-0000-4000-8000-000000000004', 'carrier', 'Transportes Marta SA de CV', 'TMA020202AB2', 'approved');
update public.profiles p set company_id = v.company_id
from (values
  ('a7100000-0000-4000-8000-000000000001'::uuid, 'c7100000-0000-4000-8000-000000000001'::uuid),
  ('a7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000002'),
  ('a7100000-0000-4000-8000-000000000004', 'c7100000-0000-4000-8000-000000000003'),
  ('a7100000-0000-4000-8000-000000000005', 'c7100000-0000-4000-8000-000000000004'),
  ('a7100000-0000-4000-8000-000000000006', 'c7100000-0000-4000-8000-000000000002'),
  ('a7100000-0000-4000-8000-00000000000a', 'c7100000-0000-4000-8000-000000000004')
) as v(profile_id, company_id)
where p.id = v.profile_id;
update public.profiles set role = 'admin' where id = 'a7100000-0000-4000-8000-000000000003';

insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
  ('d7100000-0000-4000-8000-000000000006', 'c7100000-0000-4000-8000-000000000002',
   'a7100000-0000-4000-8000-000000000006', 'Omar Operador', 'E', current_date + 365),
  ('d7100000-0000-4000-8000-00000000000a', 'c7100000-0000-4000-8000-000000000004',
   'a7100000-0000-4000-8000-00000000000a', 'Olga Operadora', 'E', current_date + 365);
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002', 'trailer', 'DCU7101', 'dry_van', 30000),
  ('e7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000004', 'trailer', 'DCU7102', 'dry_van', 30000),
  -- Mario's second unit is kept out of every offer and trip, for the
  -- recommendations (a unit on a trip starts where the trip ends, F5).
  ('e7100000-0000-4000-8000-000000000003', 'c7100000-0000-4000-8000-000000000002', 'trailer', 'DCU7103', 'dry_van', 30000);
select tests.doc('vehicle', v.id, r.code)
from (values ('e7100000-0000-4000-8000-000000000001'::uuid), ('e7100000-0000-4000-8000-000000000002'),
             ('e7100000-0000-4000-8000-000000000003')) v(id)
cross join (values ('vehicle_registration_card'), ('vehicle_insurance_policy'), ('vehicle_permit')) r(code);
select tests.doc('operator', o.id, r.code)
from (values ('d7100000-0000-4000-8000-000000000006'::uuid), ('d7100000-0000-4000-8000-00000000000a')) o(id)
cross join (values ('operator_official_id'), ('federal_driver_license')) r(code);

insert into tests.vals
select 'mario_unit', id from public.business_units
where company_id = 'c7100000-0000-4000-8000-000000000002' and archived_at is null;

-- ---------------------------------------------------------------------------
-- What is in flight when the company stops being approved
-- ---------------------------------------------------------------------------
set local role authenticated;

-- Sara: a draft, a published load nobody answered, a published load with
-- Marta's offer waiting for her, and a load sent to Transport (brokered).
select tests.login('a7100000-0000-4000-8000-000000000001');
insert into tests.vals select 'sara_draft', public.create_load(tests.payload(2));
insert into tests.vals select 'sara_published', public.create_load(tests.payload(3));
select public.publish_load(tests.val('sara_published'));
insert into tests.vals select 'sara_negotiating', public.create_load(tests.payload(4));
select public.publish_load(tests.val('sara_negotiating'));
insert into tests.vals select 'sara_brokered', public.request_brokered_load(tests.payload(5), 3000000);
select tests.login('a7100000-0000-4000-8000-000000000005');
insert into tests.vals
select 'marta_offer', public.make_offer(tests.val('sara_negotiating'), 3200000, null, 'e7100000-0000-4000-8000-000000000002');

-- Silvia: a load Mario negotiates (her counter-offer waits for him), a load
-- Mario won (its trip waits for a unit and an operator) and a published load
-- Mario never touched.
select tests.login('a7100000-0000-4000-8000-000000000004');
insert into tests.vals select 'silvia_negotiating', public.create_load(tests.payload(6));
select public.publish_load(tests.val('silvia_negotiating'));
insert into tests.vals select 'silvia_won', public.create_load(tests.payload(7));
select public.publish_load(tests.val('silvia_won'));
insert into tests.vals select 'silvia_published', public.create_load(tests.payload(8));
select public.publish_load(tests.val('silvia_published'));
select tests.login('a7100000-0000-4000-8000-000000000002');
insert into tests.vals
select 'mario_offer', public.make_offer(tests.val('silvia_negotiating'), 3000000, null, 'e7100000-0000-4000-8000-000000000001');
insert into tests.vals
select 'mario_won_offer', public.make_offer(tests.val('silvia_won'), 3000000, null, 'e7100000-0000-4000-8000-000000000001');
-- A link to a published load, shared with his team while approved (G7).
insert into tests.tokens
select 'mario_share', token from public.create_share_link('load_internal', tests.val('silvia_published'));
-- Mario's second unit is free in Monterrey, where the loads are picked up.
select public.set_vehicle_availability('e7100000-0000-4000-8000-000000000003', now(), 25.6866, -100.3161,
                                       'Monterrey', 'Nuevo León');
select tests.login('a7100000-0000-4000-8000-000000000004');
insert into tests.vals select 'silvia_counter', public.counter_offer(tests.val('mario_offer'), 3300000);
insert into tests.vals select 'mario_trip', public.accept_offer(tests.val('mario_won_offer'));

-- Control: while approved, Mario is recommended a load that fits his unit.
insert into tests.vals select 'control_load', public.create_load(tests.payload(1));
select public.publish_load(tests.val('control_load'));
select is(
  tests.match_notices('a7100000-0000-4000-8000-000000000002', tests.val('control_load')), 1,
  'control: an approved carrier with a free unit is recommended the load'
);
select tests.login('a7100000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.loads where id = tests.val('silvia_published')), 1,
  'control: an approved carrier reads a published load'
);
select lives_ok(
  $$ select * from public.match_candidates('e7100000-0000-4000-8000-000000000003') $$,
  'control: an approved carrier asks for recommendations'
);

-- ---------------------------------------------------------------------------
-- One test per blocked action, for each state that is not `approved`
-- ---------------------------------------------------------------------------
select tests.audit('pending_review');
select tests.audit('rejected');
select tests.audit('expired');
select tests.audit('suspended');

-- Nothing of the above moved: every load, offer and trip is where it was.
reset role;
select results_eq(
  $$ select v.name, l.status::text from tests.vals v join public.loads l on l.id = v.id
     where v.name like 'sara_%' or v.name like 'silvia_%' order by v.name $$,
  $$ values ('sara_brokered', 'draft'), ('sara_draft', 'draft'), ('sara_negotiating', 'negotiating'),
            ('sara_published', 'published'), ('silvia_negotiating', 'negotiating'),
            ('silvia_published', 'published'), ('silvia_won', 'contracted') $$,
  'no blocked call changed a load'
);
select is(
  (select count(*)::int from public.offers o
   where o.id in (tests.val('marta_offer'), tests.val('silvia_counter')) and o.status = 'pending'),
  2, 'the offers that waited for an answer still wait'
);
select is(
  (select t.vehicle_id from public.trips t where t.id = tests.val('mario_trip')), null,
  'the trip is still unassigned'
);

-- Back to approved, the same calls work: the gate is the state, nothing else.
select tests.set_status('approved');
set local role authenticated;
select tests.login('a7100000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.publish_load(tests.val('sara_draft')) $$,
  'approved again: the shipper publishes the draft'
);
select tests.login('a7100000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.assign_trip(tests.val('mario_trip'), 'e7100000-0000-4000-8000-000000000001',
                                'd7100000-0000-4000-8000-000000000006') $$,
  'approved again: the carrier assigns the trip'
);

-- ---------------------------------------------------------------------------
-- An account without a company (D48: it enters the panel too)
-- ---------------------------------------------------------------------------

select tests.audit_without_company('a7100000-0000-4000-8000-000000000007', 'a shipper');
select tests.audit_without_company('a7100000-0000-4000-8000-000000000008', 'a manager');
select tests.audit_without_company('a7100000-0000-4000-8000-000000000009', 'a coordinator');
reset role;

select * from finish();
rollback;
