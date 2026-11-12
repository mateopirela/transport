-- I2 · Pilot support (D41) and the hombre-camión's documents (D16-E2):
--   * support.whatsapp and support.hours exist, start empty and every
--     signed-in profile reads them (anon does not);
--   * only an admin writes them, through admin_set_platform_setting, which
--     accepts an E.164 phone or null and 1 to 200 characters of hours or
--     null (trimmed), and audits each change; nobody updates the table;
--   * a hombre-camión's company asks in one account for the company's
--     documents (CSF and the legal representative's id), the personal ones
--     of its operator row (official id and license) and each truck's
--     (registration card, permits and insurance), and only that company
--     reads them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i2.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

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

-- The codes p_sql returns as p_uid, sorted and joined by commas.
create function tests.codes(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute format('select string_agg(code, '','' order by code) from (%s) x', p_sql) into v;
  execute 'reset role';
  return v;
end;
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a51…: 01 shipper, 02 manager of F, 03 operator of F,
-- 04 hombre camión (manager of H), 05 admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a5100000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a5100000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a5100000-0000-4000-8000-000000000003', 'operator');
select tests.new_user('a5100000-0000-4000-8000-000000000004', 'manager');
select tests.new_user('a5100000-0000-4000-8000-000000000005', 'shipper');
update public.profiles set role = 'admin' where id = 'a5100000-0000-4000-8000-000000000005';

insert into public.companies (id, type, legal_name, rfc, status, is_owner_operator) values
  ('c5100000-0000-4000-8000-000000000001', 'shipper', 'Envíos Uno SA de CV', 'EUN050505GH5', 'approved', false),
  ('c5100000-0000-4000-8000-000000000002', 'carrier', 'Fletes Dos SA de CV', 'FDO040404CD4', 'approved', false),
  ('c5100000-0000-4000-8000-000000000004', 'carrier', 'Hugo Camión', 'HUCA800101AB1', 'pending_review', true);
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000001'
where id = 'a5100000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000002'
where id in ('a5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000003');
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000004'
where id = 'a5100000-0000-4000-8000-000000000004';

-- The hombre camión drives: an operator row linked to the Gerente (D13), and a truck.
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, phone)
select 'd5100000-0000-4000-8000-000000000004', 'c5100000-0000-4000-8000-000000000004', b.id,
       'a5100000-0000-4000-8000-000000000004', 'Hugo Camión', '8112345678'
from public.business_units b where b.company_id = 'c5100000-0000-4000-8000-000000000004';
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, phone)
select 'd5100000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000002', b.id,
       'a5100000-0000-4000-8000-000000000003', 'Óscar Operador', '8187654321'
from public.business_units b where b.company_id = 'c5100000-0000-4000-8000-000000000002';
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg)
select 'e5100000-0000-4000-8000-000000000004', 'c5100000-0000-4000-8000-000000000004', b.id,
       'rigid', 'HUC5101', 'dry_van', 30000
from public.business_units b where b.company_id = 'c5100000-0000-4000-8000-000000000004';

-- One document of each group, waiting for review.
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select 'c5100000-0000-4000-8000-000000000004', r.id, o.owner_type, o.owner_id,
       'c5100000-0000-4000-8000-000000000004/' || o.owner_type || '/' || o.owner_id || '/' || gen_random_uuid() || '.pdf',
       'pending_review', case when r.requires_expiry then now() + interval '1 year' end
from (values
  ('company'::public.document_owner_type, 'c5100000-0000-4000-8000-000000000004'::uuid, 'tax_status_certificate'),
  ('operator'::public.document_owner_type, 'd5100000-0000-4000-8000-000000000004'::uuid, 'federal_driver_license'),
  ('vehicle'::public.document_owner_type, 'e5100000-0000-4000-8000-000000000004'::uuid, 'vehicle_insurance_policy')
) o(owner_type, owner_id, code)
join public.document_requirements r on r.code = o.code and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- The settings: they exist, start empty and every signed-in profile reads them
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select key, value from public.platform_settings where key like 'support.%' order by key $$,
  $$ values ('support.hours', 'null'::jsonb), ('support.whatsapp', 'null'::jsonb) $$,
  'support.whatsapp and support.hours start empty: no number in the code or the seed'
);
select is(tests.sees('a5100000-0000-4000-8000-000000000001',
  'select 1 from public.platform_settings where key like ''support.%'''), 2::bigint,
  'a shipper reads the support settings');
select is(tests.sees('a5100000-0000-4000-8000-000000000002',
  'select 1 from public.platform_settings where key like ''support.%'''), 2::bigint,
  'a Gerente reads them');
select is(tests.sees('a5100000-0000-4000-8000-000000000003',
  'select 1 from public.platform_settings where key like ''support.%'''), 2::bigint,
  'an operator reads them');
select is(tests.sees('a5100000-0000-4000-8000-000000000004',
  'select 1 from public.platform_settings where key like ''support.%'''), 2::bigint,
  'a hombre camión reads them');

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select 1 from public.platform_settings where key = 'support.whatsapp' $$,
  '42501', null, 'anon does not read them');
reset role;

-- ---------------------------------------------------------------------------
-- Writes: only the admin, through the RPC, validated per key
-- ---------------------------------------------------------------------------
select ok(
  not has_any_column_privilege('authenticated', 'public.platform_settings', 'insert, update')
  and not has_table_privilege('authenticated', 'public.platform_settings', 'delete'),
  'no client inserts, updates or deletes platform settings'
);

set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000002');
select throws_ok($$ select public.admin_set_platform_setting('support.whatsapp', '"+528112345678"') $$,
  '42501', 'only admins can change platform settings', 'a Gerente cannot set the support number');
select throws_ok($$ update public.platform_settings set value = '"+528112345678"' where key = 'support.whatsapp' $$,
  '42501', null, 'nor update the row');
select tests.login('a5100000-0000-4000-8000-000000000003');
select throws_ok($$ select public.admin_set_platform_setting('support.hours', '"24 horas"') $$,
  '42501', 'only admins can change platform settings', 'an operator cannot set the hours');
select tests.login('a5100000-0000-4000-8000-000000000001');
select throws_ok($$ select public.admin_set_platform_setting('support.whatsapp', null) $$,
  '42501', 'only admins can change platform settings', 'a shipper cannot clear the number');

select tests.login('a5100000-0000-4000-8000-000000000005');
select throws_ok($$ select public.admin_set_platform_setting('support.whatsapp', '"8112345678"') $$,
  '22023', 'invalid value for support.whatsapp', 'the number is in E.164 (the apps normalize it first)');
select throws_ok($$ select public.admin_set_platform_setting('support.whatsapp', '"+52 81 1234 5678"') $$,
  '22023', 'invalid value for support.whatsapp', 'without spaces');
select throws_ok($$ select public.admin_set_platform_setting('support.whatsapp', '"+0528112345678"') $$,
  '22023', 'invalid value for support.whatsapp', 'without a leading zero');
select throws_ok($$ select public.admin_set_platform_setting('support.whatsapp', '"+52811"') $$,
  '22023', 'invalid value for support.whatsapp', 'with 8 to 15 digits');
select throws_ok($$ select public.admin_set_platform_setting('support.whatsapp', '528112345678') $$,
  '22023', 'invalid value for support.whatsapp', 'a JSON number is not a phone');
select throws_ok($$ select public.admin_set_platform_setting('support.hours', '"   "') $$,
  '22023', 'invalid value for support.hours', 'blank hours are refused (null clears them)');
select throws_ok(
  format($$ select public.admin_set_platform_setting('support.hours', %L) $$, to_jsonb(repeat('a', 201))),
  '22023', 'invalid value for support.hours', 'the hours fit in 200 characters');
select throws_ok($$ select public.admin_set_platform_setting('support.hours', '8') $$,
  '22023', 'invalid value for support.hours', 'the hours are text');
select throws_ok($$ select public.admin_set_platform_setting('support.email', '"a@b.mx"') $$,
  '22023', 'unknown setting', 'only known settings');

select lives_ok($$ select public.admin_set_platform_setting('support.whatsapp', '"+528112345678"') $$,
  'the admin sets the support number');
select lives_ok(
  $$ select public.admin_set_platform_setting('support.hours', to_jsonb(E'  Lunes a sábado, 8:00 a 20:00\n'::text)) $$,
  'and the hours');
select lives_ok(
  format($$ select public.admin_set_platform_setting('support.hours', %L) $$, to_jsonb(repeat('a', 200))),
  '200 characters of hours are accepted');
select lives_ok($$ select public.admin_set_platform_setting('support.hours', to_jsonb(E'  Lunes a sábado, 8:00 a 20:00\n'::text)) $$,
  'the hours change again');
reset role;

select results_eq(
  $$ select key, value from public.platform_settings where key like 'support.%' order by key $$,
  $$ values ('support.hours', '"Lunes a sábado, 8:00 a 20:00"'::jsonb), ('support.whatsapp', '"+528112345678"'::jsonb) $$,
  'the number is saved as is and the hours trimmed'
);
select is(tests.sees('a5100000-0000-4000-8000-000000000003',
  'select 1 from public.platform_settings where key = ''support.whatsapp'' and value = ''"+528112345678"'''),
  1::bigint, 'the operator reads the new number');
select is(
  (select count(*) from public.audit_log
   where table_name = 'platform_settings' and actor_id = 'a5100000-0000-4000-8000-000000000005'
     and new_data ->> 'key' like 'support.%'),
  4::bigint,
  'each change is in the audit log with the admin'
);

set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000005');
select lives_ok($$ select public.admin_set_platform_setting('support.whatsapp', null) $$,
  'the admin clears the number (SQL null)');
select lives_ok($$ select public.admin_set_platform_setting('support.hours', 'null') $$,
  'and the hours (JSON null)');
reset role;
select results_eq(
  $$ select key, value from public.platform_settings where key like 'support.%' order by key $$,
  $$ values ('support.hours', 'null'::jsonb), ('support.whatsapp', 'null'::jsonb) $$,
  'without a number "Ayuda" goes away'
);

-- ---------------------------------------------------------------------------
-- The hombre-camión's documents (D16-E2): the three groups in one account
-- ---------------------------------------------------------------------------
select is(
  tests.codes('a5100000-0000-4000-8000-000000000004',
    'select code from public.company_missing_requirements(''c5100000-0000-4000-8000-000000000004'')'),
  'legal_representative_id,tax_status_certificate',
  'the company asks for the CSF and the legal representative''s id'
);
select is(
  tests.codes('a5100000-0000-4000-8000-000000000004',
    $$ select r.code from public.document_requirements r
       where r.owner_type = 'operator' and r.is_required and r.archived_at is null
         and (r.company_type is null or r.company_type = 'carrier') $$),
  'federal_driver_license,operator_official_id',
  'the personal ones: official id and driver''s license'
);
select is(
  tests.codes('a5100000-0000-4000-8000-000000000004',
    'select code from public.vehicle_missing_requirements(''e5100000-0000-4000-8000-000000000004'')'),
  'vehicle_insurance_policy,vehicle_permit,vehicle_registration_card',
  'and each truck''s: registration card, permits and insurance'
);
select is(tests.sees('a5100000-0000-4000-8000-000000000004',
  'select 1 from public.operators where profile_id = ''a5100000-0000-4000-8000-000000000004'''), 1::bigint,
  'the hombre camión reads their own operator row (the personal group)');
select is(
  tests.codes('a5100000-0000-4000-8000-000000000004',
    $$ select d.owner_type::text as code from public.documents d
       where d.company_id = 'c5100000-0000-4000-8000-000000000004' and d.archived_at is null $$),
  'company,operator,vehicle',
  'and the documents of the three groups'
);
select is(tests.sees('a5100000-0000-4000-8000-000000000002',
  'select 1 from public.documents where company_id = ''c5100000-0000-4000-8000-000000000004'''), 0::bigint,
  'another carrier does not read them');
select is(tests.sees('a5100000-0000-4000-8000-000000000001',
  'select 1 from public.documents where company_id = ''c5100000-0000-4000-8000-000000000004'''), 0::bigint,
  'nor a shipper');

select * from finish();
rollback;
