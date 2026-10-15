-- Fleet (B04): role x operation RLS matrix for vehicles, operators,
-- operator_invitations, carrier_routes and vehicle_availability, isolation
-- between companies, operator invitations (D15) and owner-operators (D13).
begin;
create extension if not exists pgtap with schema extensions;

select plan(73);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_email text, p_role text, p_confirmed boolean default true)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (
    p_id, 'authenticated', 'authenticated', p_email,
    case when p_confirmed then now() end,
    jsonb_build_object('role', p_role), now(), now()
  );
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated')::text,
    true
  );
$$;

-- Codes returned by create_operator_invitation, kept across role switches.
create table tests.codes (name text primary key, code text not null);
grant select, insert, update on tests.codes to authenticated;

-- Users:
--   ...01 carrier A      ...02 carrier B      ...03 operator invited by A
--   ...04 shipper S      ...05 admin          ...06 operator, other email
--   ...07 operator, unconfirmed email         ...08 operator (expired code)
-- Companies: c...0a = A (carrier), c...0b = B (carrier), c...0c = S (shipper).
select tests.new_user('b0000000-0000-4000-8000-000000000001', 'carla@a.test', 'carrier');
select tests.new_user('b0000000-0000-4000-8000-000000000002', 'bruno@b.test', 'carrier');
select tests.new_user('b0000000-0000-4000-8000-000000000003', 'omar@a.test', 'operator');
select tests.new_user('b0000000-0000-4000-8000-000000000004', 'sofia@s.test', 'shipper');
select tests.new_user('b0000000-0000-4000-8000-000000000005', 'admin@x.test', 'shipper');
select tests.new_user('b0000000-0000-4000-8000-000000000006', 'otro@x.test', 'operator');
select tests.new_user('b0000000-0000-4000-8000-000000000007', 'pablo@a.test', 'operator', false);
select tests.new_user('b0000000-0000-4000-8000-000000000008', 'eva@a.test', 'operator');

insert into public.companies (id, type, legal_name, rfc) values
  ('c0000000-0000-4000-8000-00000000000a', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1'),
  ('c0000000-0000-4000-8000-00000000000b', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2'),
  ('c0000000-0000-4000-8000-00000000000c', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3');

update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000a'
where id = 'b0000000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000b'
where id = 'b0000000-0000-4000-8000-000000000002';
update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000c'
where id = 'b0000000-0000-4000-8000-000000000004';
update public.profiles set role = 'admin' where id = 'b0000000-0000-4000-8000-000000000005';

-- Fleet of B (created with a privileged role).
insert into public.operators (id, company_id, full_name, email) values
  ('d0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b', 'Beto Operador', 'beto@b.test');
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b', 'trailer', 'BBB1234', 'dry_van', 30000);
insert into public.carrier_routes (company_id, origin_city, origin_state, destination_city, destination_state) values
  ('c0000000-0000-4000-8000-00000000000b', 'Monterrey', 'Nuevo León', 'Guadalajara', 'Jalisco');

-- ---------------------------------------------------------------------------
-- Carrier A manages its own fleet
-- ---------------------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  public.auth_fleet_company_id(), 'c0000000-0000-4000-8000-00000000000a'::uuid,
  'auth_fleet_company_id() returns the carrier company'
);

select lives_ok(
  $$ insert into public.operators (id, company_id, full_name, email, license_type, license_expires_on)
     values ('d0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-00000000000a',
             'Omar Operador', 'omar@a.test', 'E', '2030-01-01'),
            ('d0000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a',
             'Pablo Operador', 'pablo@a.test', 'E', '2030-01-01'),
            ('d0000000-0000-4000-8000-0000000000a3', 'c0000000-0000-4000-8000-00000000000a',
             'Eva Operadora', 'eva@a.test', 'B', '2030-01-01') $$,
  'carrier registers operators'
);
select lives_ok(
  $$ insert into public.vehicles (id, company_id, kind, plate, fleet_number)
     values ('e0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-00000000000a', 'tractor', 'AAA1111', 'T-01') $$,
  'carrier registers a tractor'
);
select lives_ok(
  $$ insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg, capacity_m3, features, current_operator_id)
     values ('e0000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a', 'rigid', 'AAA2222',
             'refrigerated', 12000, 45.5, '{temperature_control}', 'd0000000-0000-4000-8000-0000000000a1') $$,
  'carrier registers a rigid truck assigned to its operator'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate, unit_type)
     values ('c0000000-0000-4000-8000-00000000000a', 'tractor', 'AAA3333', 'dry_van') $$,
  '23514', null,
  'a tractor cannot have a body type'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate)
     values ('c0000000-0000-4000-8000-00000000000a', 'trailer', 'AAA4444') $$,
  '23514', null,
  'a trailer requires unit type and capacity'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate) values ('c0000000-0000-4000-8000-00000000000a', 'tractor', 'aaa1111') $$,
  '23514', null,
  'plates are stored normalized (uppercase, no spaces)'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate) values ('c0000000-0000-4000-8000-00000000000a', 'tractor', 'AAA1111') $$,
  '23505', null,
  'a plate is registered once per company'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate) values ('c0000000-0000-4000-8000-00000000000b', 'tractor', 'XXX9999') $$,
  '42501', null,
  'carrier cannot add a vehicle to another company'
);
select throws_ok(
  $$ insert into public.operators (company_id, full_name) values ('c0000000-0000-4000-8000-00000000000b', 'Intruso') $$,
  '42501', null,
  'carrier cannot add an operator to another company'
);
select throws_ok(
  $$ update public.vehicles set current_operator_id = 'd0000000-0000-4000-8000-0000000000b1'
     where id = 'e0000000-0000-4000-8000-0000000000a1' $$,
  '23503', null,
  'carrier cannot assign an operator of another company'
);
select throws_ok(
  $$ insert into public.operators (company_id, profile_id, full_name)
     values ('c0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000006', 'Secuestro') $$,
  '42501', null,
  'carrier cannot link another user as operator'
);
select lives_ok(
  $$ insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on)
     values ('d0000000-0000-4000-8000-0000000000a9', 'c0000000-0000-4000-8000-00000000000a',
             'b0000000-0000-4000-8000-000000000001', 'Carla (hombre-camión)', 'E', '2030-01-01') $$,
  'an owner-operator registers itself as operator (D13)'
);
select is(
  public.auth_operator_id(), 'd0000000-0000-4000-8000-0000000000a9'::uuid,
  'auth_operator_id() returns the owner-operator row'
);
select throws_ok(
  $$ update public.operators set profile_id = 'b0000000-0000-4000-8000-000000000003'
     where id = 'd0000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'profile_id cannot be set with a plain update'
);
select throws_ok(
  $$ update public.vehicles set company_id = 'c0000000-0000-4000-8000-00000000000b'
     where id = 'e0000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'a vehicle cannot be moved to another company'
);
select throws_ok(
  $$ delete from public.vehicles where id = 'e0000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'clients cannot delete vehicles (they are archived)'
);
select throws_ok(
  $$ delete from public.operators where id = 'd0000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'clients cannot delete operators (they are archived)'
);
select lives_ok(
  $$ update public.vehicles set capacity_kg = 13000 where id = 'e0000000-0000-4000-8000-0000000000a2' $$,
  'carrier updates its own vehicle'
);
select lives_ok(
  $$ update public.vehicles set plate = 'HACK000' where id = 'e0000000-0000-4000-8000-0000000000b1' $$,
  'updating another company vehicle runs but matches no rows'
);
select results_eq(
  $$ select id from public.vehicles order by id $$,
  $$ values ('e0000000-0000-4000-8000-0000000000a1'::uuid), ('e0000000-0000-4000-8000-0000000000a2'::uuid) $$,
  'carrier sees only its own vehicles'
);
select is(
  (select count(*) from public.operators where company_id <> 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'carrier sees only its own operators'
);

-- carrier_routes
select lives_ok(
  $$ insert into public.carrier_routes (company_id, origin_city, origin_state, destination_city, destination_state, unit_types)
     values ('c0000000-0000-4000-8000-00000000000a', 'Monterrey', 'Nuevo León', 'Guadalajara', 'Jalisco', '{refrigerated}') $$,
  'carrier adds a usual route'
);
select throws_ok(
  $$ insert into public.carrier_routes (company_id, origin_city, origin_state, destination_city, destination_state)
     values ('c0000000-0000-4000-8000-00000000000b', 'X', 'X', 'Y', 'Y') $$,
  '42501', null,
  'carrier cannot add a route to another company'
);
select results_eq(
  $$ select company_id from public.carrier_routes $$,
  $$ values ('c0000000-0000-4000-8000-00000000000a'::uuid) $$,
  'carrier sees only its own routes'
);
select throws_ok(
  $$ delete from public.carrier_routes $$,
  '42501', null,
  'clients cannot delete routes (they are archived)'
);

-- vehicle_availability
select lives_ok(
  $$ select public.set_vehicle_availability('e0000000-0000-4000-8000-0000000000a2', '2026-11-01 08:00-06',
                                            20.6597, -103.3496, 'Guadalajara', 'Jalisco') $$,
  'carrier sets the availability of its unit'
);
select lives_ok(
  $$ select public.set_vehicle_availability('e0000000-0000-4000-8000-0000000000a2', '2026-11-03 08:00-06',
                                            25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  'carrier replaces the availability of its unit'
);
select results_eq(
  $$ select city, archived_at is null from public.vehicle_availability
     where vehicle_id = 'e0000000-0000-4000-8000-0000000000a2' order by available_from $$,
  $$ values ('Guadalajara', false), ('Monterrey', true) $$,
  'only the latest availability stays active; the previous one is kept as history'
);
select is(
  (select round(extensions.st_y(location::extensions.geometry)::numeric, 4)
   from public.vehicle_availability where archived_at is null),
  25.6866,
  'availability stores the point as (longitude, latitude)'
);
select throws_ok(
  $$ select public.set_vehicle_availability('e0000000-0000-4000-8000-0000000000a2', now(), 95, 0, 'X', 'Y') $$,
  '22023', null,
  'invalid coordinates are rejected'
);
select throws_ok(
  $$ select public.set_vehicle_availability('e0000000-0000-4000-8000-0000000000b1', now(), 20, -100, 'X', 'Y') $$,
  '42501', null,
  'carrier cannot set the availability of another company unit'
);
select throws_ok(
  $$ insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state)
     values ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000a2', now(),
             'POINT(-100 25)', 'X', 'Y') $$,
  '42501', null,
  'availability is written only through the RPC'
);

-- operator_invitations
insert into tests.codes
select 'omar', code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a1');
insert into tests.codes
select 'pablo', code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a2');
insert into tests.codes
select 'eva_old', code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a3');
insert into tests.codes
select 'eva', code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a3', 1);

select ok(
  (select code ~ '^[0-9A-HJKMNP-TV-Z]{16}$' from tests.codes where name = 'omar'),
  'invitation codes are 16 Crockford base32 characters'
);
select results_eq(
  $$ select operator_id, accepted_at is null, revoked_at is not null from public.operator_invitations
     where operator_id = 'd0000000-0000-4000-8000-0000000000a3' order by created_at, revoked_at nulls last $$,
  $$ values ('d0000000-0000-4000-8000-0000000000a3'::uuid, true, true),
            ('d0000000-0000-4000-8000-0000000000a3'::uuid, true, false) $$,
  're-inviting an operator revokes the previous pending invitation'
);
select throws_ok(
  $$ select code_hash from public.operator_invitations $$,
  '42501', null,
  'clients cannot read invitation code hashes'
);
select throws_ok(
  $$ insert into public.operator_invitations (company_id, operator_id, email, code_hash, expires_at)
     values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a1', 'omar@a.test',
             '\x00', now() + interval '1 day') $$,
  '42501', null,
  'invitations are created only through the RPC'
);
select throws_ok(
  $$ select public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a9') $$,
  '22023', null,
  'an operator that already has an account cannot be invited'
);
select throws_ok(
  $$ select public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a1', 0) $$,
  '22023', null,
  'the invitation lifetime is bounded'
);
select lives_ok(
  $$ select public.revoke_operator_invitation(
       (select id from public.operator_invitations
        where operator_id = 'd0000000-0000-4000-8000-0000000000a2' and revoked_at is null)) $$,
  'carrier revokes a pending invitation'
);

-- ---------------------------------------------------------------------------
-- Carrier B and shipper S cannot touch A's fleet
-- ---------------------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-000000000002');

select results_eq(
  $$ select id from public.vehicles $$,
  $$ values ('e0000000-0000-4000-8000-0000000000b1'::uuid) $$,
  'another carrier sees only its own vehicles'
);
select is_empty(
  $$ select id from public.operators where company_id = 'c0000000-0000-4000-8000-00000000000a'
     union all select id from public.operator_invitations
     union all select id from public.vehicle_availability $$,
  'another carrier sees no operators, invitations or availability of A'
);
select throws_ok(
  $$ select public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a1') $$,
  '42501', null,
  'another carrier cannot invite A''s operators'
);
select throws_ok(
  $$ select public.clear_vehicle_availability('e0000000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'another carrier cannot clear A''s availability'
);

select tests.login('b0000000-0000-4000-8000-000000000004');

select is(public.auth_fleet_company_id(), null, 'a shipper manages no fleet');
select is_empty(
  $$ select id from public.vehicles union all select id from public.operators
     union all select id from public.carrier_routes union all select id from public.vehicle_availability $$,
  'a shipper sees no fleet data'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate) values ('c0000000-0000-4000-8000-00000000000c', 'tractor', 'SSS1111') $$,
  '42501', null,
  'a shipper cannot register vehicles'
);

-- ---------------------------------------------------------------------------
-- Accepting invitations (D15)
-- ---------------------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.accept_operator_invitation((select code from tests.codes where name = 'omar')) $$,
  '42501', null,
  'a carrier account cannot accept an operator invitation'
);

select tests.login('b0000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.accept_operator_invitation((select code from tests.codes where name = 'omar')) $$,
  '42501', null,
  'an invitation cannot be accepted with another email'
);
select throws_ok(
  $$ select public.accept_operator_invitation('0000000000000000') $$,
  '22023', null,
  'an unknown code is rejected'
);

select tests.login('b0000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.accept_operator_invitation((select code from tests.codes where name = 'pablo')) $$,
  '22023', null,
  'a revoked invitation fails'
);

select tests.login('b0000000-0000-4000-8000-000000000003');
select is(
  public.accept_operator_invitation(
    (select lower(substr(code, 1, 4) || '-' || substr(code, 5, 4) || ' ' || substr(code, 9)) from tests.codes where name = 'omar')
  ),
  'd0000000-0000-4000-8000-0000000000a1'::uuid,
  'the invited operator accepts (code is case and separator insensitive)'
);
select is(
  public.auth_company_id(), 'c0000000-0000-4000-8000-00000000000a'::uuid,
  'the operator joins the carrier company'
);
select results_eq(
  $$ select id from public.operators $$,
  $$ values ('d0000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'an operator sees only its own operator row'
);
select results_eq(
  $$ select id from public.vehicles $$,
  $$ values ('e0000000-0000-4000-8000-0000000000a2'::uuid) $$,
  'an operator sees only the unit assigned to it'
);
select is_empty(
  $$ select id from public.operator_invitations union all select id from public.carrier_routes
     union all select id from public.vehicle_availability $$,
  'an operator sees no invitations, routes or availability'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate) values ('c0000000-0000-4000-8000-00000000000a', 'tractor', 'OOO1111') $$,
  '42501', null,
  'an operator cannot register vehicles'
);
select lives_ok(
  $$ update public.operators set license_expires_on = '2040-01-01' where id = 'd0000000-0000-4000-8000-0000000000a1' $$,
  'an operator update of its row runs but matches no rows'
);

select tests.login('b0000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.accept_operator_invitation((select code from tests.codes where name = 'omar')) $$,
  '22023', null,
  'a used invitation fails'
);

select tests.login('b0000000-0000-4000-8000-000000000008');
select throws_ok(
  $$ select public.accept_operator_invitation((select code from tests.codes where name = 'eva_old')) $$,
  '22023', null,
  'a superseded invitation fails'
);

reset role;
update public.operator_invitations set expires_at = now() - interval '1 second'
where operator_id = 'd0000000-0000-4000-8000-0000000000a3' and revoked_at is null;
set local role authenticated;
select throws_ok(
  $$ select public.accept_operator_invitation((select code from tests.codes where name = 'eva')) $$,
  '22023', null,
  'an expired invitation fails'
);

-- Unconfirmed email: re-invite Pablo and try with the unconfirmed account.
select tests.login('b0000000-0000-4000-8000-000000000001');
update tests.codes set code = (
  select code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000a2')
) where name = 'pablo';
select tests.login('b0000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.accept_operator_invitation((select code from tests.codes where name = 'pablo')) $$,
  '42501', null,
  'an unconfirmed email cannot accept an invitation'
);

-- ---------------------------------------------------------------------------
-- Archiving an operator releases its unit
-- ---------------------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ update public.operators set archived_at = now() where id = 'd0000000-0000-4000-8000-0000000000a1' $$,
  'carrier archives an operator'
);
select is(
  (select current_operator_id from public.vehicles where id = 'e0000000-0000-4000-8000-0000000000a2'),
  null,
  'the archived operator is unassigned from its unit'
);
select throws_ok(
  $$ update public.vehicles set current_operator_id = 'd0000000-0000-4000-8000-0000000000a1'
     where id = 'e0000000-0000-4000-8000-0000000000a2' $$,
  '23514', null,
  'an archived operator cannot be assigned'
);

select lives_ok(
  $$ update public.vehicles set archived_at = now() where id = 'e0000000-0000-4000-8000-0000000000a2' $$,
  'carrier archives a unit'
);
select is_empty(
  $$ select id from public.vehicle_availability where archived_at is null $$,
  'archiving a unit ends its active availability'
);
select throws_ok(
  $$ select public.set_vehicle_availability('e0000000-0000-4000-8000-0000000000a2', now(), 20, -100, 'X', 'Y') $$,
  '22023', null,
  'an archived unit cannot be made available'
);

select tests.login('b0000000-0000-4000-8000-000000000003');
select is_empty($$ select id from public.vehicles $$, 'an unassigned operator sees no units');

-- ---------------------------------------------------------------------------
-- Admin and anon
-- ---------------------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-000000000005');
select is(
  (select count(distinct company_id) from public.vehicles
   where company_id in ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000b')),
  2::bigint,
  'admin sees every company fleet'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate) values ('c0000000-0000-4000-8000-00000000000a', 'tractor', 'ADM1111') $$,
  '42501', null,
  'admin does not register vehicles for carriers'
);

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select * from public.vehicles $$, '42501', null, 'anon cannot read vehicles');
select throws_ok(
  $$ select public.accept_operator_invitation('0000000000000000') $$,
  '42501', null,
  'anon cannot accept invitations'
);

reset role;
select * from finish();
rollback;
