-- H4 · Road intelligence (D31):
--   * the pilot corridor MTY ↔ GDL exists (migration data, also without seed),
--     with only sourced tolls and no risks;
--   * the catalog is read by everyone signed in (archived rows only by
--     admins), never by anon, and written only by admins through the RPCs,
--     which validate and leave every change in audit_log;
--   * road_catalog() returns active corridors with their current tolls and
--     active risks, and drops archived corridors, segments and risks;
--   * carrier_road_preferences: the manager and coordinators of the company
--     read and write theirs; other companies, operators and shippers do not;
--   * vehicles.axle_count stays between 2 and 9.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@h4.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Dates of the catalog are days in Mexico City (CI runs in UTC).
create function tests.today()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Mexico_City')::date $$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- How many rows of p_sql p_uid sees.
create function tests.sees(p_uid uuid, p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute format('select count(*) from (%s) x', p_sql) into v_count;
  execute 'reset role';
  return v_count;
end;
$$;

-- Columns: S shipper, M manager, A coordinator, O operator, X other manager, admin.
create function tests.matrix(p_sql text)
returns text
language sql
as $$
  select string_agg(tests.sees(u.id, p_sql)::text, ',' order by u.id)
  from (values ('a4500000-0000-4000-8000-000000000001'::uuid), ('a4500000-0000-4000-8000-000000000002'),
               ('a4500000-0000-4000-8000-000000000003'), ('a4500000-0000-4000-8000-000000000004'),
               ('a4500000-0000-4000-8000-000000000005'), ('a4500000-0000-4000-8000-000000000006')) as u(id);
$$;

create function tests.catalog_codes()
returns text[]
language sql
as $$
  select coalesce(array_agg(c ->> 'code' order by c ->> 'code'), '{}')
  from jsonb_array_elements(public.road_catalog()) c
$$;

create function tests.catalog_segment(p_code text)
returns jsonb
language sql
as $$
  select s
  from jsonb_array_elements(public.road_catalog()) c, jsonb_array_elements(c -> 'segments') s
  where s ->> 'code' = p_code
  limit 1
$$;

create function tests.audit_count(p_table text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*) from public.audit_log
  where table_name = p_table and actor_id = 'a4500000-0000-4000-8000-000000000006'
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select tests.new_user('a4500000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a4500000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a4500000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a4500000-0000-4000-8000-000000000004', 'operator');
select tests.new_user('a4500000-0000-4000-8000-000000000005', 'manager');
select tests.new_user('a4500000-0000-4000-8000-000000000006', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c4500000-0000-4000-8000-000000000001', 'shipper', 'Envíos H4 SA de CV', 'EHC050505GH5', 'approved'),
  ('c4500000-0000-4000-8000-000000000002', 'carrier', 'Fletes H4 SA de CV', 'FHC040404CD4', 'approved'),
  ('c4500000-0000-4000-8000-000000000003', 'carrier', 'Otros Fletes SA de CV', 'OFL040404CD4', 'approved');
update public.profiles set company_id = 'c4500000-0000-4000-8000-000000000001'
where id = 'a4500000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c4500000-0000-4000-8000-000000000002'
where id in ('a4500000-0000-4000-8000-000000000002', 'a4500000-0000-4000-8000-000000000003',
             'a4500000-0000-4000-8000-000000000004');
update public.profiles set company_id = 'c4500000-0000-4000-8000-000000000003'
where id = 'a4500000-0000-4000-8000-000000000005';
update public.profiles set role = 'admin' where id = 'a4500000-0000-4000-8000-000000000006';
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
select id, company_id, 'a4500000-0000-4000-8000-000000000003'
from public.business_units where company_id = 'c4500000-0000-4000-8000-000000000002';
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on)
select 'd4500000-0000-4000-8000-00000000000a', company_id, id, 'a4500000-0000-4000-8000-000000000004',
       'Óscar H4', 'E', current_date + 365
from public.business_units where company_id = 'c4500000-0000-4000-8000-000000000002';

insert into public.carrier_routes (id, company_id, origin_city, origin_state, destination_city, destination_state) values
  ('f4500000-0000-4000-8000-00000000000a', 'c4500000-0000-4000-8000-000000000002', 'Monterrey', 'Nuevo León',
   'Guadalajara', 'Jalisco'),
  ('f4500000-0000-4000-8000-00000000000b', 'c4500000-0000-4000-8000-000000000003', 'Monterrey', 'Nuevo León',
   'Guadalajara', 'Jalisco');
insert into tests.vals select 'sal_mat', id from public.road_segments where code = 'SAL-MAT';
insert into tests.vals select 'slp_lag', id from public.road_segments where code = 'SLP-LAG';

-- ---------------------------------------------------------------------------
-- 1. The pilot corridor (migration data)
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select code from public.road_corridors where archived_at is null and code like 'MTY-GDL-%' $$,
  array['MTY-GDL-SLP', 'MTY-GDL-ZAC'],
  'the pilot corridors MTY–GDL exist: the main one and an alternative'
);
select is(
  (select array_agg(s.code order by cs.seq) from public.road_corridor_segments cs
   join public.road_corridors c on c.id = cs.corridor_id join public.road_segments s on s.id = cs.segment_id
   where c.code = 'MTY-GDL-SLP'),
  array['MTY-SAL', 'SAL-MAT', 'MAT-SLP', 'SLP-LAG', 'LAG-ZAP', 'ZAP-GDL'],
  'the main corridor goes through Saltillo and San Luis Potosí'
);
select is(
  (select amount_cents from public.road_segment_tolls where segment_id = tests.val('slp_lag') and vehicle_class = 'c5'),
  44200::bigint,
  'the CAPUFE tariff of the Lagos de Moreno plaza for a 5-axle truck is in'
);
select is_empty(
  $$ select 1 from public.road_segment_tolls t
     where t.source not like 'CAPUFE%' or t.source_url is null or t.data_status <> 'estimated' $$,
  'every pilot toll comes from the published CAPUFE tariffs and is marked estimated'
);
select is_empty(
  $$ select 1 from public.road_segment_risks r join public.road_segments s on s.id = r.segment_id
     where r.source is null or r.observed_on is null $$,
  'no risk without a source and a date'
);

-- ---------------------------------------------------------------------------
-- 2. Reading the catalog
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.road_catalog()', 'execute'),
  'anon cannot read the road catalog'
);
select is(tests.matrix($$ select 1 from public.road_corridors where code = 'MTY-GDL-SLP' $$),
          '1,1,1,1,1,1', 'everyone signed in reads the corridors');

set local role authenticated;
select tests.login('a4500000-0000-4000-8000-000000000001');
select ok(tests.catalog_codes() @> array['MTY-GDL-SLP', 'MTY-GDL-ZAC'], 'a shipper reads road_catalog');
select is(
  (tests.catalog_segment('SLP-LAG') -> 'tolls' -> 3 ->> 'amountCents')::bigint,
  44200::bigint,
  'road_catalog carries the current toll of each class'
);
select is(
  jsonb_array_length(tests.catalog_segment('MAT-SLP') -> 'tolls'),
  0,
  'a segment without tariffs has no tolls'
);

-- ---------------------------------------------------------------------------
-- 3. Writing the catalog: admins only, by RPC, validated and audited
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.road_segments (code, name, from_city, from_state, from_lat, from_lng, to_city, to_state,
                                       to_lat, to_lng, distance_km, source, source_date)
     values ('X-Y', 'X', 'a', 'b', 1, 1, 'c', 'd', 2, 2, 10, 'x', tests.today()) $$,
  '42501', null, 'no client inserts into the catalog directly'
);
select throws_ok(
  $$ update public.road_segment_tolls set amount_cents = 1 $$,
  '42501', null, 'no client updates tolls directly'
);
select throws_ok(
  $$ select public.admin_set_segment_toll(tests.val('slp_lag'), 'c5', 'x', tests.today(), 'estimated', 1, null) $$,
  '42501', 'only admins edit the road catalog', 'a shipper cannot edit tolls'
);
select tests.login('a4500000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.admin_upsert_road_segment('NEW-SEG', 'Nuevo', 'Saltillo', 'Coahuila', 25.4, -101, 'Matehuala', 'San Luis Potosí', 23.6, -100.6, 100, false, 'x', tests.today(), 'estimated', null, null, null, null) $$,
  '42501', 'only admins edit the road catalog', 'a manager cannot add segments'
);

select tests.login('a4500000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.admin_upsert_road_segment('NEW-SEG', 'Nuevo', 'Saltillo', 'Coahuila', 25.4, -101, 'Matehuala', 'San Luis Potosí', 23.6, -100.6, 100, false, '  ', tests.today(), 'estimated', null, null, null, null) $$,
  '22023', 'a source is required', 'the source is required'
);
select throws_ok(
  $$ select public.admin_upsert_road_segment('NEW-SEG', 'Nuevo', 'Saltillo', 'Coahuila', 25.4, -101, 'Matehuala', 'San Luis Potosí', 23.6, -100.6, 100, false, 'x', tests.today(), 'estimated', null, null, null, 'http://insecure.test') $$,
  '22023', 'the source link must be an https URL', 'the source link must be https'
);
select throws_ok(
  $$ select public.admin_upsert_road_segment('NEW-SEG', 'Nuevo', 'Saltillo', 'Coahuila', 25.4, -101, 'Matehuala', 'San Luis Potosí', 23.6, -100.6, 100, false, 'x', tests.today() + 2, 'estimated', null, null, null, null) $$,
  '22023', 'source_date cannot be in the future', 'the source date cannot be in the future'
);
select throws_ok(
  $$ select public.admin_upsert_road_segment('NEW-SEG', 'Nuevo', 'Saltillo', 'Coahuila', 25.4, -101, 'Matehuala', 'San Luis Potosí', 23.6, -100.6, 100, false, 'x', null, 'estimated', null, null, null, null) $$,
  '22023', 'source_date is required', 'the source date is required'
);
insert into tests.vals select 'new_seg', public.admin_upsert_road_segment('sal-mat-libre', 'Saltillo – Matehuala (libre)', 'Saltillo', 'Coahuila', 25.4383, -100.9737, 'Matehuala', 'San Luis Potosí', 23.6489, -100.6436, 265, false, 'Prueba', tests.today(), 'verified', null, '57', null, 'https://example.test/x');
select is(
  (select code from public.road_segments where id = tests.val('new_seg')),
  'SAL-MAT-LIBRE', 'an admin adds a segment (code upper-cased)'
);
select is(tests.audit_count('road_segments'), 1::bigint, 'the new segment is in the audit log');

-- Tolls: the admin corrects a tariff and road_catalog reflects it.
select lives_ok(
  $$ select public.admin_set_segment_toll(tests.val('slp_lag'), 'c5', 'Corrección del admin', tests.today(), 'verified', 45000, 'https://example.test/tarifa') $$,
  'an admin corrects a tariff'
);
select is(
  (tests.catalog_segment('SLP-LAG') -> 'tolls' -> 3 ->> 'amountCents')::bigint,
  45000::bigint,
  'road_catalog shows the corrected tariff from today'
);
select lives_ok(
  $$ select public.admin_set_segment_toll(tests.val('slp_lag'), 'c5', 'Tarifa futura', tests.today() + 30, 'estimated', 99900, null) $$,
  'an admin can load a tariff that starts later'
);
select is(
  (tests.catalog_segment('SLP-LAG') -> 'tolls' -> 3 ->> 'amountCents')::bigint,
  45000::bigint,
  'a tariff that has not started yet is not current'
);
select lives_ok(
  $$ select public.admin_set_segment_toll(tests.val('sal_mat'), 'c9', 'Sin tarifa publicada', tests.today(), 'estimated', null, null) $$,
  'a tariff can be recorded as unknown (null)'
);
select is(tests.audit_count('road_segment_tolls'), 3::bigint, 'every toll change is in the audit log');

-- Risks: validated hours, archived ones leave the catalog.
select throws_ok(
  $$ select public.admin_upsert_segment_risk(tests.val('sal_mat'), 'high', 22::smallint, 22::smallint, 'robo', 'x', tests.today(), 'estimated', null, null) $$,
  '22023', 'invalid hour band', 'a band needs two different hours'
);
select throws_ok(
  $$ select public.admin_upsert_segment_risk(tests.val('sal_mat'), 'high', 22::smallint, 25::smallint, 'robo', 'x', tests.today(), 'estimated', null, null) $$,
  '22023', 'invalid hour band', 'hours go up to 24'
);
insert into tests.vals select 'risk', public.admin_upsert_segment_risk(tests.val('sal_mat'), 'high', 22::smallint, 6::smallint, 'robo a transporte de carga', 'Fuente de prueba', tests.today(), 'estimated', null, null);
select is(
  tests.catalog_segment('SAL-MAT') -> 'risks' -> 0 ->> 'level', 'high',
  'an active risk is in road_catalog'
);
select lives_ok(
  $$ select public.admin_upsert_segment_risk(tests.val('sal_mat'), 'high', 22::smallint, 6::smallint, 'robo a transporte de carga', 'Fuente de prueba', tests.today(), 'estimated', tests.val('risk'), null, true) $$,
  'an admin archives a risk'
);
select is(
  jsonb_array_length(tests.catalog_segment('SAL-MAT') -> 'risks'), 0,
  'road_catalog does not return archived risks'
);
select is(tests.audit_count('road_segment_risks'), 2::bigint, 'risk changes are in the audit log');

-- Corridors: consecutive segments must connect; archived ones leave the catalog.
select throws_ok(
  $$ select public.admin_upsert_corridor('BROKEN', 'Roto', 'Monterrey', 'Nuevo León', 25.6866, -100.3161, 60, 'Guadalajara', 'Jalisco', 20.6597, -103.3496, 60, true, array[(select id from public.road_segments where code = 'MTY-SAL'), tests.val('slp_lag')], null) $$,
  '22023', 'consecutive segments must connect', 'a corridor of disconnected segments is refused'
);
insert into tests.vals select 'corridor', public.admin_upsert_corridor('mty-gdl-libre', 'MTY–GDL por la libre', 'Monterrey', 'Nuevo León', 25.6866, -100.3161, 60, 'Guadalajara', 'Jalisco', 20.6597, -103.3496, 60, true, (select array_agg(id order by n) from (
     select s.id, u.n from unnest(array['MTY-SAL', 'SAL-MAT-LIBRE', 'MAT-SLP', 'SLP-LAG', 'LAG-ZAP', 'ZAP-GDL'])
       with ordinality u(code, n) join public.road_segments s on s.code = u.code) x), null);
select ok('MTY-GDL-LIBRE' = any (tests.catalog_codes()), 'an admin adds a corridor');
select lives_ok(
  $$ select public.admin_upsert_road_segment('SAL-MAT-LIBRE', 'Saltillo – Matehuala (libre)', 'Saltillo', 'Coahuila', 25.4383, -100.9737, 'Matehuala', 'San Luis Potosí', 23.6489, -100.6436, 265, false, 'Prueba', tests.today(), 'verified', tests.val('new_seg'), '57', null, null, true) $$,
  'an admin archives a segment'
);
select ok(not ('MTY-GDL-LIBRE' = any (tests.catalog_codes())),
          'road_catalog drops a corridor with an archived segment');
select is(tests.matrix(format('select 1 from public.road_segments where id = %L', tests.val('new_seg'))),
          '0,0,0,0,0,1', 'only admins see archived segments');
-- tests.matrix resets the role.
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 4. carrier_road_preferences
-- ---------------------------------------------------------------------------
select tests.login('a4500000-0000-4000-8000-000000000003');
insert into tests.vals select 'pref_a', public.set_carrier_road_preference(tests.val('sal_mat'), 'avoid', 'f4500000-0000-4000-8000-00000000000a');
select is(
  (select preference::text from public.carrier_road_preferences where id = tests.val('pref_a')),
  'avoid', 'a coordinator marks a segment to avoid on a route'
);
select tests.login('a4500000-0000-4000-8000-000000000002');
select is(
  public.set_carrier_road_preference(tests.val('sal_mat'), 'prefer', 'f4500000-0000-4000-8000-00000000000a'),
  tests.val('pref_a'), 'the manager changes the same preference (one active per route and segment)'
);
select lives_ok(
  $$ select public.set_carrier_road_preference(tests.val('slp_lag'), 'prefer', null) $$,
  'a preference for every route'
);
select is(tests.matrix('select 1 from public.carrier_road_preferences where archived_at is null'),
          '0,2,2,0,0,2', 'only the company staff and admins see its preferences');
set local role authenticated;

select tests.login('a4500000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.set_carrier_road_preference(tests.val('sal_mat'), 'avoid', null) $$,
  '42501', 'only carrier staff mark road preferences', 'an operator cannot mark preferences'
);
select tests.login('a4500000-0000-4000-8000-000000000005');
select throws_ok(
  $$ insert into public.carrier_road_preferences (company_id, segment_id, preference)
     values ('c4500000-0000-4000-8000-000000000002', tests.val('sal_mat'), 'avoid') $$,
  '42501', null, 'another company cannot write our preferences'
);
select throws_ok(
  $$ select public.set_carrier_road_preference(tests.val('slp_lag'), 'avoid', 'f4500000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'another company cannot use our route'
);
update public.carrier_road_preferences set preference = 'avoid' where id = tests.val('pref_a');
select tests.login('a4500000-0000-4000-8000-000000000002');
select is(
  (select preference::text from public.carrier_road_preferences where id = tests.val('pref_a')),
  'prefer', 'an update of another company changes nothing'
);
select is(
  public.set_carrier_road_preference(tests.val('sal_mat'), null, 'f4500000-0000-4000-8000-00000000000a'),
  null::uuid, 'clearing a preference archives it'
);
select is(
  (select archived_at is not null from public.carrier_road_preferences where id = tests.val('pref_a')),
  true, 'the cleared preference is archived, not deleted'
);

-- ---------------------------------------------------------------------------
-- 5. vehicles.axle_count
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$ insert into public.vehicles (company_id, business_unit_id, kind, plate, unit_type, capacity_kg, axle_count)
     select company_id, id, 'rigid', 'AXL4501', 'torton', 12000, 10
     from public.business_units where company_id = 'c4500000-0000-4000-8000-000000000002' $$,
  '23514', null, 'a truck has at most 9 axles'
);

select * from finish();
rollback;
