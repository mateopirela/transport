-- Vehicle readiness (B18): required vehicle documents that are missing or
-- expired, visibility of that information by role and company, the
-- expired-documents check of set_vehicle_availability, and the revocation of
-- pending operator invitations when the operator's email changes.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id || '@test.local', now(),
          jsonb_build_object('role', p_role), now(), now());
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

create function tests.requirement(p_code text)
returns uuid
language sql
stable
as $$
  select id from public.document_requirements where code = p_code;
$$;

-- An approved vehicle document (written with a privileged role, as review_document would).
create function tests.approved_vehicle_document(p_vehicle uuid, p_code text, p_expires_at timestamptz)
returns uuid
language sql
as $$
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select v.company_id, tests.requirement(p_code), 'vehicle', v.id,
         v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf', 'approved', p_expires_at
  from public.vehicles v where v.id = p_vehicle
  returning id;
$$;

-- Users: ...01 carrier A, ...02 carrier B, ...03 shipper S, ...04 admin.
select tests.new_user('f1000000-0000-4000-8000-000000000001', 'carrier');
select tests.new_user('f1000000-0000-4000-8000-000000000002', 'carrier');
select tests.new_user('f1000000-0000-4000-8000-000000000003', 'shipper');
select tests.new_user('f1000000-0000-4000-8000-000000000004', 'shipper');

insert into public.companies (id, type, legal_name, rfc) values
  ('c1000000-0000-4000-8000-00000000000a', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1'),
  ('c1000000-0000-4000-8000-00000000000b', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2'),
  ('c1000000-0000-4000-8000-00000000000c', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3');

update public.profiles set company_id = 'c1000000-0000-4000-8000-00000000000a'
where id = 'f1000000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c1000000-0000-4000-8000-00000000000b'
where id = 'f1000000-0000-4000-8000-000000000002';
update public.profiles set company_id = 'c1000000-0000-4000-8000-00000000000c'
where id = 'f1000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin' where id = 'f1000000-0000-4000-8000-000000000004';

-- Units: a1 (A, complete documents), a2 (A, one expired), b1 (B, none).
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e1000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-00000000000a', 'trailer', 'AAA0001', 'dry_van', 30000),
  ('e1000000-0000-4000-8000-0000000000a2', 'c1000000-0000-4000-8000-00000000000a', 'trailer', 'AAA0002', 'dry_van', 30000),
  ('e1000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-00000000000b', 'rigid', 'BBB0001', 'torton', 12000);

select tests.approved_vehicle_document('e1000000-0000-4000-8000-0000000000a1', 'vehicle_registration_card', now() + interval '1 year');
select tests.approved_vehicle_document('e1000000-0000-4000-8000-0000000000a1', 'vehicle_insurance_policy', now() + interval '1 year');
select tests.approved_vehicle_document('e1000000-0000-4000-8000-0000000000a2', 'vehicle_registration_card', now() + interval '1 year');
select tests.approved_vehicle_document('e1000000-0000-4000-8000-0000000000a2', 'vehicle_insurance_policy', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- Carrier A sees the state of its own units
-- ---------------------------------------------------------------------------
select tests.login('f1000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*)::int from public.vehicle_missing_requirements('e1000000-0000-4000-8000-0000000000a1')),
  0,
  'a unit with every required document approved and current misses nothing'
);
select is(
  (select count(*)::int from public.vehicle_expired_requirements('e1000000-0000-4000-8000-0000000000a1')),
  0,
  'a unit with current documents has nothing expired'
);
select results_eq(
  $$ select code from public.vehicle_missing_requirements('e1000000-0000-4000-8000-0000000000a2') $$,
  array['vehicle_insurance_policy'],
  'an expired approved document counts as missing'
);
select results_eq(
  $$ select code from public.vehicle_expired_requirements('e1000000-0000-4000-8000-0000000000a2') $$,
  array['vehicle_insurance_policy'],
  'and it is reported as expired'
);

select lives_ok(
  $$ select public.set_vehicle_availability('e1000000-0000-4000-8000-0000000000a1', now(), 25.67, -100.31, 'Monterrey', 'Nuevo León') $$,
  'a unit with current documents can be made available'
);
select throws_ok(
  $$ select public.set_vehicle_availability('e1000000-0000-4000-8000-0000000000a2', now(), 25.67, -100.31, 'Monterrey', 'Nuevo León') $$,
  '55000',
  'vehicle has expired documents: vehicle_insurance_policy',
  'a unit with expired documents cannot be made available'
);
select is(
  (select count(*)::int from public.vehicle_availability where vehicle_id = 'e1000000-0000-4000-8000-0000000000a2'),
  0,
  'the refused call wrote no availability'
);

-- Carrier B cannot read anything about A's units.
reset role;
select tests.login('f1000000-0000-4000-8000-000000000002');
set local role authenticated;

select is(
  (select count(*)::int from public.vehicle_missing_requirements('e1000000-0000-4000-8000-0000000000a2')),
  0,
  'another carrier sees no requirements of a unit it does not own'
);
select is(
  (select count(*)::int from public.vehicle_expired_requirements('e1000000-0000-4000-8000-0000000000a2')),
  0,
  'another carrier sees no expired documents of a unit it does not own'
);
select throws_ok(
  $$ select public.set_vehicle_availability('e1000000-0000-4000-8000-0000000000a1', now(), 25.67, -100.31, 'Monterrey', 'Nuevo León') $$,
  '42501',
  'vehicle not found',
  'another carrier cannot set availability of a unit it does not own'
);
select is(
  (select count(*)::int from public.vehicle_missing_requirements('e1000000-0000-4000-8000-0000000000b1')),
  2,
  'a unit without documents misses every required vehicle document'
);
select lives_ok(
  $$ select public.set_vehicle_availability('e1000000-0000-4000-8000-0000000000b1', now(), 20.67, -103.35, 'Guadalajara', 'Jalisco') $$,
  'missing (not expired) documents do not block availability'
);

-- The shipper sees nothing.
reset role;
select tests.login('f1000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(
  (select count(*)::int from public.vehicle_missing_requirements('e1000000-0000-4000-8000-0000000000a2')),
  0,
  'a shipper sees no vehicle requirements'
);
select is(
  (select count(*)::int from public.vehicle_expired_requirements('e1000000-0000-4000-8000-0000000000a2')),
  0,
  'a shipper sees no expired vehicle documents'
);

-- The admin sees every unit.
reset role;
select tests.login('f1000000-0000-4000-8000-000000000004');
set local role authenticated;

select results_eq(
  $$ select code from public.vehicle_expired_requirements('e1000000-0000-4000-8000-0000000000a2') $$,
  array['vehicle_insurance_policy'],
  'an admin sees the expired documents of any unit'
);
select is(
  (select count(*)::int from public.vehicle_missing_requirements('e1000000-0000-4000-8000-0000000000b1')),
  2,
  'an admin sees the missing documents of any unit'
);

-- Anonymous callers cannot execute the helpers.
reset role;
select is(
  has_function_privilege('anon', 'public.vehicle_missing_requirements(uuid)', 'execute'),
  false,
  'anon cannot execute vehicle_missing_requirements'
);
select is(
  has_function_privilege('anon', 'public.vehicle_expired_requirements(uuid)', 'execute'),
  false,
  'anon cannot execute vehicle_expired_requirements'
);

-- A renewed (approved, current) document makes the unit available again.
update public.documents set archived_at = now()
where owner_id = 'e1000000-0000-4000-8000-0000000000a2' and expires_at <= now();
select tests.approved_vehicle_document('e1000000-0000-4000-8000-0000000000a2', 'vehicle_insurance_policy', now() + interval '1 year');

select tests.login('f1000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*)::int from public.vehicle_expired_requirements('e1000000-0000-4000-8000-0000000000a2')),
  0,
  'a renewed document clears the expired state'
);
select lives_ok(
  $$ select public.set_vehicle_availability('e1000000-0000-4000-8000-0000000000a2', now(), 25.67, -100.31, 'Monterrey', 'Nuevo León') $$,
  'after renewal the unit can be made available'
);

-- A document marked `expired` (e.g. by an expiry job) also blocks the unit.
reset role;
update public.documents set status = 'expired'
where owner_id = 'e1000000-0000-4000-8000-0000000000a2' and status = 'approved' and expires_at > now()
  and requirement_id = tests.requirement('vehicle_insurance_policy');

select tests.login('f1000000-0000-4000-8000-000000000001');
set local role authenticated;

select results_eq(
  $$ select code from public.vehicle_expired_requirements('e1000000-0000-4000-8000-0000000000a2') $$,
  array['vehicle_insurance_policy'],
  'a document with status expired is reported as expired'
);
select throws_ok(
  $$ select public.set_vehicle_availability('e1000000-0000-4000-8000-0000000000a2', now(), 25.67, -100.31, 'Monterrey', 'Nuevo León') $$,
  '55000',
  'vehicle has expired documents: vehicle_insurance_policy',
  'a document with status expired blocks availability'
);

-- ---------------------------------------------------------------------------
-- Changing an operator's email revokes its pending invitations
-- ---------------------------------------------------------------------------
insert into public.operators (id, company_id, full_name, email) values
  ('d1000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-00000000000a', 'Omar', 'omar@a.test');
select ok(
  (select count(*) = 1 from public.create_operator_invitation('d1000000-0000-4000-8000-0000000000a1')),
  'the carrier invites its operator'
);

update public.operators set phone = '8112345678' where id = 'd1000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int from public.operator_invitations
   where operator_id = 'd1000000-0000-4000-8000-0000000000a1' and revoked_at is null),
  1,
  'other changes keep the pending invitation'
);

update public.operators set email = 'omar.diaz@a.test' where id = 'd1000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int from public.operator_invitations
   where operator_id = 'd1000000-0000-4000-8000-0000000000a1' and revoked_at is null),
  0,
  'changing the email revokes the pending invitation'
);
select ok(
  (select count(*) = 1 from public.create_operator_invitation('d1000000-0000-4000-8000-0000000000a1')),
  'the carrier issues a new invitation'
);
select is(
  (select email from public.operator_invitations
   where operator_id = 'd1000000-0000-4000-8000-0000000000a1' and revoked_at is null),
  'omar.diaz@a.test',
  'the new invitation goes to the corrected email'
);

select * from finish();
rollback;
