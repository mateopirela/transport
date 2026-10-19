-- G6 · Provider approval (D21): the status per shipper–carrier pair, its
-- immutable history, who decides (only the shipper, with a carrier it
-- negotiated with), the transitions, who reads it, and the
-- provider_status_changed notice to the carrier staff.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g6p.test', now(),
          jsonb_build_object('role', p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.payload()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 10000, 'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 3500000
  );
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;
create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

create function tests.notices(p_user uuid)
returns text[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(data ->> 'status' order by data ->> 'status'), '{}')
  from public.notifications where user_id = p_user and type = 'provider_status_changed';
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a35…: 01 shipper S, 02 shipper S2 (same company), 03 manager M,
-- 04 coordinator K ("Principal"), 05 coordinator N ("Norte"), 06 another
-- shipper X, 07 manager Y (another carrier), 08 operator O, 09 admin.
select tests.new_user('a3500000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a3500000-0000-4000-8000-000000000002', 'shipper');
select tests.new_user('a3500000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a3500000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a3500000-0000-4000-8000-000000000005', 'coordinator');
select tests.new_user('a3500000-0000-4000-8000-000000000006', 'shipper');
select tests.new_user('a3500000-0000-4000-8000-000000000007', 'manager');
select tests.new_user('a3500000-0000-4000-8000-000000000008', 'operator');
select tests.new_user('a3500000-0000-4000-8000-000000000009', 'shipper');
update public.profiles set role = 'admin' where id = 'a3500000-0000-4000-8000-000000000009';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c3500000-0000-4000-8000-000000000001', 'shipper', 'Envíos Treinta y Cinco SA de CV', 'ETC050505GH7', 'approved'),
  ('c3500000-0000-4000-8000-000000000002', 'carrier', 'Fletes Treinta y Cinco SA de CV', 'FTC040404CD8', 'approved'),
  ('c3500000-0000-4000-8000-000000000003', 'shipper', 'Otro Cliente SA de CV', 'OCL050505GH9', 'approved'),
  ('c3500000-0000-4000-8000-000000000004', 'carrier', 'Otros Fletes SA de CV', 'OFL040404CD1', 'approved');
update public.profiles set company_id = 'c3500000-0000-4000-8000-000000000001'
where id in ('a3500000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000002');
update public.profiles set company_id = 'c3500000-0000-4000-8000-000000000002'
where id in ('a3500000-0000-4000-8000-000000000003', 'a3500000-0000-4000-8000-000000000004',
             'a3500000-0000-4000-8000-000000000005', 'a3500000-0000-4000-8000-000000000008');
update public.profiles set company_id = 'c3500000-0000-4000-8000-000000000003'
where id = 'a3500000-0000-4000-8000-000000000006';
update public.profiles set company_id = 'c3500000-0000-4000-8000-000000000004'
where id = 'a3500000-0000-4000-8000-000000000007';

insert into public.business_units (id, company_id, name) values
  ('b3500000-0000-4000-8000-000000000002', 'c3500000-0000-4000-8000-000000000002', 'Norte');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
select b.id, b.company_id, 'a3500000-0000-4000-8000-000000000004'
from public.business_units b where b.company_id = 'c3500000-0000-4000-8000-000000000002' and b.name = 'Principal';
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  ('b3500000-0000-4000-8000-000000000002', 'c3500000-0000-4000-8000-000000000002', 'a3500000-0000-4000-8000-000000000005');

-- A negotiation between S and the carrier, made by K for "Principal".
set local role authenticated;
select tests.login('a3500000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload());
select public.publish_load(tests.val('load'));
select tests.login('a3500000-0000-4000-8000-000000000004');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3000000, null, null);
reset role;
insert into tests.vals select 'negotiation', negotiation_id from public.offers where id = tests.val('offer');

-- ---------------------------------------------------------------------------
-- Who decides
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3500000-0000-4000-8000-000000000003');
select throws_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'approved') $$,
  '42501', 'only a shipper approves providers', 'the carrier cannot approve itself');
select tests.login('a3500000-0000-4000-8000-000000000008');
select throws_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'approved') $$,
  '42501', null, 'nor its operator');
select tests.login('a3500000-0000-4000-8000-000000000006');
select throws_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'approved') $$,
  '42501', 'carrier not found', 'a shipper that never negotiated with the carrier cannot');
select tests.login('a3500000-0000-4000-8000-000000000001');
select throws_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000004', 'approved') $$,
  '42501', 'carrier not found', 'nor can S with a carrier it did not negotiate with');
select throws_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'approved', repeat('x', 1001)) $$,
  '22023', 'notes are too long', 'notes are at most 1000 characters');
select throws_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'revoked') $$,
  '55000', 'cannot change a provider from pending to revoked', 'a pending provider cannot be revoked');

-- ---------------------------------------------------------------------------
-- Transitions and history
-- ---------------------------------------------------------------------------
select is(public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'approved', ' Documentos en regla '),
  'approved'::public.provider_status, 'the shipper approves the carrier');
select is(
  (select status::text || ':' || notes || ':' || (decided_by = 'a3500000-0000-4000-8000-000000000001')
   from public.provider_approvals),
  'approved:Documentos en regla:true', 'with trimmed notes and who decided');
select is(public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'approved'),
  'approved'::public.provider_status, 'asking again is harmless');
select throws_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'rejected') $$,
  '55000', 'cannot change a provider from approved to rejected', 'an approved provider is revoked, not rejected');
select lives_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'revoked') $$,
  'the shipper revokes the approval');
select lives_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'rejected', 'Sin seguro') $$,
  'a revoked provider can be rejected');
select tests.login('a3500000-0000-4000-8000-000000000002');
select lives_ok($$ select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'approved') $$,
  'and approved again, by any member of the shipper');
select is(
  (select array_agg(status::text order by decided_at, id) from public.provider_approval_events),
  array['approved', 'revoked', 'rejected', 'approved'], 'every change is in the history, a repeated one is not');
select throws_ok($$ update public.provider_approvals set status = 'rejected' $$, '42501', null,
  'clients never write the status directly');
select throws_ok(
  $$ insert into public.provider_approval_events (shipper_company_id, carrier_company_id, status)
     values ('c3500000-0000-4000-8000-000000000001', 'c3500000-0000-4000-8000-000000000002', 'approved') $$,
  '42501', null, 'nor the history');
reset role;
select throws_ok($$ update public.provider_approval_events set notes = 'x' $$, '42501', null, 'the history is immutable');
select throws_ok($$ delete from public.provider_approval_events $$, '42501', null, 'and cannot be deleted');

-- ---------------------------------------------------------------------------
-- Who reads it
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3500000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.provider_approvals), 1, 'the shipper reads its decision');
select tests.login('a3500000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.provider_approvals), 1, 'the carrier''s manager reads it');
select tests.login('a3500000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.provider_approval_events), 4,
  'every coordinator of the carrier reads it (it is the company''s)');
select tests.login('a3500000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.provider_approvals) + (select count(*)::int from public.provider_approval_events),
  0, 'another shipper reads nothing');
select tests.login('a3500000-0000-4000-8000-000000000007');
select is((select count(*)::int from public.provider_approvals) + (select count(*)::int from public.provider_approval_events),
  0, 'nor another carrier');
select tests.login('a3500000-0000-4000-8000-000000000008');
select is((select count(*)::int from public.provider_approvals), 0, 'nor the carrier''s operator');
select tests.login('a3500000-0000-4000-8000-000000000009');
select is((select count(*)::int from public.provider_approvals), 1, 'admins read it');
reset role;

-- ---------------------------------------------------------------------------
-- provider_status_changed: the carrier staff of the pair's latest negotiation
-- or trip
-- ---------------------------------------------------------------------------
select is(tests.notices('a3500000-0000-4000-8000-000000000003'), array['approved', 'approved', 'rejected', 'revoked'],
  'the manager is told of every change');
select is(tests.notices('a3500000-0000-4000-8000-000000000004'), array['approved', 'approved', 'rejected', 'revoked'],
  'and the coordinator of the negotiation''s business unit');
select is(tests.notices('a3500000-0000-4000-8000-000000000005'), '{}'::text[],
  'not the coordinator of another business unit');
select is(
  (select data ->> 'shipperName' || ':' || (data ->> 'negotiationId') from public.notifications
   where user_id = 'a3500000-0000-4000-8000-000000000003' and type = 'provider_status_changed'
   order by created_at limit 1),
  'Envíos Treinta y Cinco SA de CV:' || tests.val('negotiation'), 'with the shipper''s name and the negotiation');

-- Once there is a trip, the notice points at it.
set local role authenticated;
select tests.login('a3500000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select public.set_provider_status('c3500000-0000-4000-8000-000000000002', 'revoked');
reset role;
select is(
  (select data ->> 'tripId' from public.notifications
   where user_id = 'a3500000-0000-4000-8000-000000000004' and type = 'provider_status_changed' and data ? 'tripId'),
  tests.val('trip')::text, 'after the offer is accepted the notice links the trip');

select * from finish();
rollback;
