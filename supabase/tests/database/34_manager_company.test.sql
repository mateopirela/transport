-- G4 · The manager's "Mi empresa" (D19):
--   * every RPC is the manager's: a coordinator gets 42501, and a manager
--     never reaches another company's rows;
--   * business units: create, rename (names unique per company), archive
--     only when empty (no units, operators, pending offers or open trips),
--     never the last one, and nothing is added to an archived one;
--   * coordinators: set their business units (one or more), remove them
--     from the company, which takes their access away at once;
--   * moving units and operators: refused while committed to a trip, and an
--     operator moved leaves the units of other business units.
begin;
create extension if not exists pgtap with schema extensions;

select plan(60);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g4.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

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

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a34…: 01 S shipper, 02 M manager, 03 A coordinator of unit
-- A, 04 B coordinator of unit B, 05 O operator (unit A, with account),
-- 06 X manager of another carrier.
-- ---------------------------------------------------------------------------
select tests.new_user('a3400000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a3400000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a3400000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a3400000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a3400000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a3400000-0000-4000-8000-000000000006', 'manager');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c3400000-0000-4000-8000-000000000001', 'shipper', 'Envíos Uno SA de CV', 'EUN050505GH5', 'approved'),
  ('c3400000-0000-4000-8000-000000000002', 'carrier', 'Fletes Dos SA de CV', 'FDO040404CD4', 'approved'),
  ('c3400000-0000-4000-8000-000000000003', 'carrier', 'Fletes Tres SA de CV', 'FTR040404CD4', 'approved');
update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000001'
where id = 'a3400000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000002'
where id in ('a3400000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000003',
             'a3400000-0000-4000-8000-000000000004', 'a3400000-0000-4000-8000-000000000005');
update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000003'
where id = 'a3400000-0000-4000-8000-000000000006';

update public.business_units set name = 'Unidad A' where company_id = 'c3400000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c3400000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_x', id from public.business_units where company_id = 'c3400000-0000-4000-8000-000000000003';
insert into public.business_units (id, company_id, name)
values ('b3400000-0000-4000-8000-00000000000b', 'c3400000-0000-4000-8000-000000000002', 'Unidad B');
insert into tests.vals values ('bu_b', 'b3400000-0000-4000-8000-00000000000b');

insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c3400000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000003'),
  (tests.val('bu_b'), 'c3400000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000004');

-- Operators: O (unit A, account 05), Q (unit A, no account), P (unit B).
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d3400000-0000-4000-8000-00000000000a', 'c3400000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a3400000-0000-4000-8000-000000000005', 'Óscar A', 'E', current_date + 365),
  ('d3400000-0000-4000-8000-00000000000c', 'c3400000-0000-4000-8000-000000000002', tests.val('bu_a'),
   null, 'Quique A', 'E', current_date + 365),
  ('d3400000-0000-4000-8000-00000000000b', 'c3400000-0000-4000-8000-000000000002', tests.val('bu_b'),
   null, 'Pablo B', 'E', current_date + 365);
-- Units: V1 and V2 (unit A, V2 driven by Q), VB (unit B).
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg, current_operator_id) values
  ('e3400000-0000-4000-8000-00000000000a', 'c3400000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'GGA3401', 'dry_van', 30000, null),
  ('e3400000-0000-4000-8000-00000000000c', 'c3400000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'GGA3402', 'dry_van', 30000, 'd3400000-0000-4000-8000-00000000000c'),
  ('e3400000-0000-4000-8000-00000000000b', 'c3400000-0000-4000-8000-000000000002', tests.val('bu_b'),
   'rigid', 'GGB3401', 'dry_van', 30000, null);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c3400000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Trip 1: A offers load 1 with V1, S accepts, A assigns V1 and O.
-- Load 2: A's offer with V2 is still pending.
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load1'));
insert into tests.vals select 'load2', public.create_load(tests.payload(2));
select public.publish_load(tests.val('load2'));
insert into tests.vals select 'load3', public.create_load(tests.payload(3));
select public.publish_load(tests.val('load3'));

select tests.login('a3400000-0000-4000-8000-000000000003');
insert into tests.vals
select 'offer1', public.make_offer(tests.val('load1'), 3000000, null, 'e3400000-0000-4000-8000-00000000000a');
select public.make_offer(tests.val('load2'), 3000000, null, 'e3400000-0000-4000-8000-00000000000c');
select tests.login('a3400000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
select tests.login('a3400000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip1'), 'e3400000-0000-4000-8000-00000000000a',
                          'd3400000-0000-4000-8000-00000000000a');
-- A invites Q (a link for the row) and a new operator to unit A.
select public.create_invitation('operator', '{}', 'd3400000-0000-4000-8000-00000000000c');
select public.create_invitation('operator', array[tests.val('bu_a')]);
reset role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.create_business_unit(text)', 'execute')
  and not has_function_privilege('anon', 'public.rename_business_unit(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.archive_business_unit(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_coordinator_units(uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.remove_company_member(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.move_vehicle_to_unit(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.move_operator_to_unit(uuid, uuid)', 'execute'),
  'anon executes none of the manager RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.require_manager_company_id()', 'execute')
  and not has_function_privilege('authenticated', 'public.require_active_business_unit()', 'execute'),
  'the helpers are not callable by clients'
);

-- ---------------------------------------------------------------------------
-- A coordinator gets 42501 from every RPC
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000003');
select throws_ok($$ select public.create_business_unit('Bajío') $$,
  '42501', 'only the manager can manage the company', 'a coordinator does not create business units');
select throws_ok($$ select public.rename_business_unit(tests.val('bu_a'), 'Otra') $$,
  '42501', 'only the manager can manage the company', 'a coordinator does not rename them');
select throws_ok($$ select public.archive_business_unit(tests.val('bu_b')) $$,
  '42501', 'only the manager can manage the company', 'a coordinator does not archive them');
select throws_ok(
  $$ select public.set_coordinator_units('a3400000-0000-4000-8000-000000000003', array[tests.val('bu_b')]) $$,
  '42501', 'only the manager can manage the company', 'a coordinator does not choose their business units');
select throws_ok($$ select public.remove_company_member('a3400000-0000-4000-8000-000000000004') $$,
  '42501', 'only the manager can manage the company', 'a coordinator does not remove coordinators');
select throws_ok(
  $$ select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000c', tests.val('bu_b')) $$,
  '42501', 'only the manager can manage the company', 'a coordinator does not move units');
select throws_ok(
  $$ select public.move_operator_to_unit('d3400000-0000-4000-8000-00000000000c', tests.val('bu_b')) $$,
  '42501', 'only the manager can manage the company', 'a coordinator does not move operators');
select tests.login('a3400000-0000-4000-8000-000000000005');
select throws_ok($$ select public.create_business_unit('Bajío') $$,
  '42501', 'only the manager can manage the company', 'neither does an operator');

-- ---------------------------------------------------------------------------
-- Business units: create and rename
-- ---------------------------------------------------------------------------
select tests.login('a3400000-0000-4000-8000-000000000002');
insert into tests.vals select 'bu_bajio', public.create_business_unit('  Bajío ');
select is(
  (select name from public.business_units where id = tests.val('bu_bajio')),
  'Bajío', 'the manager creates a business unit, with the name trimmed'
);
select throws_ok($$ select public.create_business_unit('bajío') $$,
  '23505', null, 'two active business units of a company cannot share a name');
select throws_ok($$ select public.create_business_unit('   ') $$,
  '22023', 'business unit name must be 1 to 80 characters', 'a blank name is refused');
select throws_ok($$ select public.create_business_unit(repeat('x', 81)) $$,
  '22023', 'business unit name must be 1 to 80 characters', 'so is a name too long');
select lives_ok($$ select public.rename_business_unit(tests.val('bu_bajio'), 'Bajío Norte') $$,
  'the manager renames a business unit');
select is((select name from public.business_units where id = tests.val('bu_bajio')), 'Bajío Norte',
  'with the new name');
select throws_ok($$ select public.rename_business_unit(tests.val('bu_bajio'), 'Unidad A') $$,
  '23505', null, 'renaming to a name in use fails too');
select tests.login('a3400000-0000-4000-8000-000000000006');
select throws_ok($$ select public.rename_business_unit(tests.val('bu_bajio'), 'Mía') $$,
  '42501', 'business unit not found', 'the manager of another company does not reach it');

-- ---------------------------------------------------------------------------
-- Coordinators' business units
-- ---------------------------------------------------------------------------
select tests.login('a3400000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.set_coordinator_units('a3400000-0000-4000-8000-000000000004',
                                         array[tests.val('bu_b'), tests.val('bu_bajio'), tests.val('bu_b')]) $$,
  'the manager gives a coordinator several business units');
reset role;
select is(
  (select array_agg(business_unit_id order by business_unit_id) from public.business_unit_coordinators
   where profile_id = 'a3400000-0000-4000-8000-000000000004'),
  (select array_agg(id order by id) from public.business_units where id in (tests.val('bu_b'), tests.val('bu_bajio'))),
  'the coordinator runs exactly those'
);
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.set_coordinator_units('a3400000-0000-4000-8000-000000000004', '{}') $$,
  '22023', 'at least one business unit is required', 'a coordinator keeps at least one');
select throws_ok(
  $$ select public.set_coordinator_units('a3400000-0000-4000-8000-000000000005', array[tests.val('bu_a')]) $$,
  '42501', 'coordinator not found', 'only coordinators run business units');
select throws_ok(
  $$ select public.set_coordinator_units('a3400000-0000-4000-8000-000000000004', array[tests.val('bu_x')]) $$,
  '42501', 'business unit not found', 'and only those of the company');

-- ---------------------------------------------------------------------------
-- Moving units and operators
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000a', tests.val('bu_b')) $$,
  '55000', 'cannot move: it is committed to a trip', 'a unit assigned to a trip does not move');
select throws_ok(
  $$ select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000c', tests.val('bu_b')) $$,
  '55000', 'cannot move: it is committed to a trip', 'nor does one proposed in a pending offer');
select throws_ok(
  $$ select public.move_operator_to_unit('d3400000-0000-4000-8000-00000000000a', tests.val('bu_b')) $$,
  '55000', 'cannot move: it is committed to a trip', 'an operator with a trip in their hands does not move');
select throws_ok(
  $$ select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000b', tests.val('bu_x')) $$,
  '42501', 'business unit not found', 'a unit never moves to another company');
reset role;
-- G5: a unit waiting for its release stays in its business unit until released.
insert into public.vehicle_release_tasks (company_id, vehicle_id, business_unit_id, trip_id)
values ('c3400000-0000-4000-8000-000000000002', 'e3400000-0000-4000-8000-00000000000b', tests.val('bu_b'),
        tests.val('trip1'));
set local role authenticated;
select throws_ok(
  $$ select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000b', tests.val('bu_bajio')) $$,
  '55000', 'cannot move: it is pending release', 'a unit pending release does not move');
reset role;
delete from public.vehicle_release_tasks where vehicle_id = 'e3400000-0000-4000-8000-00000000000b';
set local role authenticated;
select lives_ok(
  $$ select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000b', tests.val('bu_bajio')) $$,
  'the manager moves a free unit');
select is((select business_unit_id from public.vehicles where id = 'e3400000-0000-4000-8000-00000000000b'),
  tests.val('bu_bajio'), 'it is in the new business unit');
select lives_ok(
  $$ select public.move_operator_to_unit('d3400000-0000-4000-8000-00000000000c', tests.val('bu_b')) $$,
  'the manager moves a free operator');
reset role;
select is((select business_unit_id from public.operators where id = 'd3400000-0000-4000-8000-00000000000c'),
  tests.val('bu_b'), 'the operator is in the new business unit');
select is(
  (select current_operator_id from public.vehicles where id = 'e3400000-0000-4000-8000-00000000000c'),
  null, 'and no longer drives the unit of the old one'
);
select is(
  (select count(*)::int from public.invitations
   where operator_id = 'd3400000-0000-4000-8000-00000000000c' and revoked_at is null and accepted_at is null),
  0, 'their pending invitation link (of the old business unit) is revoked'
);
select tests.login('a3400000-0000-4000-8000-000000000004');
select is(
  tests.sees('a3400000-0000-4000-8000-000000000004', $$ select 1 from public.operators where id = 'd3400000-0000-4000-8000-00000000000c' $$),
  1::bigint, 'the coordinator of the new business unit now sees the operator'
);
select is(
  tests.sees('a3400000-0000-4000-8000-000000000003', $$ select 1 from public.operators where id = 'd3400000-0000-4000-8000-00000000000c' $$),
  0::bigint, 'the one of the old business unit no longer does'
);

-- ---------------------------------------------------------------------------
-- Archiving business units
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000002');
-- A coordinator invitation to Bajío, to check it is revoked with it.
select public.create_invitation('coordinator', array[tests.val('bu_bajio')]);
select throws_ok($$ select public.archive_business_unit(tests.val('bu_a')) $$,
  '55000', 'business unit has active units or operators', 'a business unit with units does not archive');
select throws_ok($$ select public.archive_business_unit(tests.val('bu_bajio')) $$,
  '55000', 'business unit has active units or operators', 'even with a single unit');
select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000b', tests.val('bu_b'));
select lives_ok($$ select public.archive_business_unit(tests.val('bu_bajio')) $$,
  'an empty business unit is archived');
reset role;
select isnt((select archived_at from public.business_units where id = tests.val('bu_bajio')), null,
  'it is archived');
select is(
  (select array_agg(business_unit_id) from public.business_unit_coordinators
   where profile_id = 'a3400000-0000-4000-8000-000000000004'),
  array[tests.val('bu_b')], 'its coordinators lose it and keep the others'
);
select is(
  (select count(*)::int from public.invitations
   where tests.val('bu_bajio') = any (business_unit_ids) and revoked_at is null),
  0, 'the pending invitations to it are revoked'
);
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000002');
select throws_ok(
  $$ insert into public.vehicles (company_id, business_unit_id, kind, plate, unit_type, capacity_kg)
     values ('c3400000-0000-4000-8000-000000000002', tests.val('bu_bajio'), 'rigid', 'GGZ3401', 'dry_van', 1000) $$,
  '22023', 'business unit is archived', 'nothing is added to an archived business unit');
select throws_ok(
  $$ select public.move_vehicle_to_unit('e3400000-0000-4000-8000-00000000000b', tests.val('bu_bajio')) $$,
  '42501', 'business unit not found', 'nor moved into it');
select throws_ok($$ select public.rename_business_unit(tests.val('bu_bajio'), 'Otra vez') $$,
  '42501', 'business unit not found', 'and it is no longer renamed');
-- An empty business unit with a negotiation (the manager's pending offer).
insert into tests.vals select 'bu_empty', public.create_business_unit('Vacía');
select public.make_offer(tests.val('load3'), 3100000, null, null, tests.val('bu_empty'));
select throws_ok($$ select public.archive_business_unit(tests.val('bu_empty')) $$,
  '55000', 'business unit has open negotiations or trips', 'a pending offer keeps it open');
select tests.login('a3400000-0000-4000-8000-000000000006');
select throws_ok($$ select public.archive_business_unit(tests.val('bu_x')) $$,
  '55000', 'cannot archive the only business unit', 'a company always keeps one business unit');
select throws_ok($$ select public.archive_business_unit(tests.val('bu_b')) $$,
  '42501', 'business unit not found', 'the manager of another company does not reach it');

-- ---------------------------------------------------------------------------
-- Removing a coordinator
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.remove_company_member('a3400000-0000-4000-8000-000000000003') $$,
  '42501', 'coordinator not found', 'the manager of another company removes nobody here');
select tests.login('a3400000-0000-4000-8000-000000000002');
select throws_ok($$ select public.remove_company_member('a3400000-0000-4000-8000-000000000002') $$,
  '42501', 'cannot remove yourself', 'the manager does not remove themselves');
select throws_ok($$ select public.remove_company_member('a3400000-0000-4000-8000-000000000005') $$,
  '42501', 'only coordinators can be removed', 'operators are archived, not removed');
reset role;
select is(
  tests.sees('a3400000-0000-4000-8000-000000000003', $$ select 1 from public.trips where id = tests.val('trip1') $$),
  1::bigint, 'before: coordinator A sees the trip of unit A'
);
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000002');
select lives_ok($$ select public.remove_company_member('a3400000-0000-4000-8000-000000000003') $$,
  'the manager removes coordinator A');
reset role;
select is(
  (select company_id from public.profiles where id = 'a3400000-0000-4000-8000-000000000003'),
  null, 'A no longer belongs to the company'
);
select is(
  (select count(*)::int from public.business_unit_coordinators where profile_id = 'a3400000-0000-4000-8000-000000000003'),
  0, 'nor runs any business unit'
);
select is(
  tests.sees('a3400000-0000-4000-8000-000000000003',
    $$ select 1 from public.trips union all select 1 from public.vehicles union all select 1 from public.operators
       union all select 1 from public.invitations $$),
  0::bigint, 'and at once sees no trip, unit, operator or invitation of it'
);
select is(
  (select count(*)::int from public.invitations
   where created_by = 'a3400000-0000-4000-8000-000000000003' and revoked_at is null and accepted_at is null),
  0, 'the links A issued are revoked'
);
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at, created_by)
     values ('c3400000-0000-4000-8000-000000000002', 'operator', array[tests.val('bu_a')],
             public.invitation_token_hash(repeat('r', 43)), now() + interval '1 day',
             'a3400000-0000-4000-8000-000000000003') $$,
  '42501', 'only the staff of a carrier company can invite',
  'an invitation issued in the middle of the removal does not survive it (its creator is checked under lock)'
);
select lives_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at, created_by)
     values ('c3400000-0000-4000-8000-000000000002', 'operator', array[tests.val('bu_a')],
             public.invitation_token_hash(repeat('m', 43)), now() + interval '1 day',
             'a3400000-0000-4000-8000-000000000002') $$,
  'a current member of the company still issues invitations'
);

-- An offer and a move of its unit serialize on the unit row (FOR SHARE).
select is(
  (select provolatile::text from pg_proc where oid = 'public.assert_vehicle_in_unit(uuid, uuid)'::regprocedure),
  'v', 'assert_vehicle_in_unit locks the unit, so it is volatile'
);

select * from finish();
rollback;
