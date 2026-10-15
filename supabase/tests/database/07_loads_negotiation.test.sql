-- Loads and negotiation (B05): role x operation RLS matrix for loads,
-- negotiations and offers, isolation between companies, the approval gate and
-- every state transition of the load and negotiation RPCs.
begin;
create extension if not exists pgtap with schema extensions;

select plan(83);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_email text, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email, now(), jsonb_build_object('role', p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- A valid load payload (loadFormSchema output) MTY -> GDL, merged with p_patch.
create function tests.payload(p_patch jsonb default '{}')
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161, 'placeId', 'mty'),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized',
    'description', 'Tarimas de refacciones',
    'weightKg', 18000.5,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array('tarp'),
    'proposedPriceCents', 3500000
  ) || p_patch;
$$;
grant execute on all functions in schema tests to authenticated;

-- Values captured across role switches.
create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;
grant execute on function tests.val(text) to authenticated;

-- Users: ...01 shipper S (approved)  ...02 shipper T (approved, other company)
--        ...03 shipper P (in review) ...04 carrier A (approved)
--        ...05 carrier B (approved)  ...06 carrier C (in review)
--        ...07 operator of A         ...08 admin
select tests.new_user('a5000000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a5000000-0000-4000-8000-000000000002', 'tomas@t.test', 'shipper');
select tests.new_user('a5000000-0000-4000-8000-000000000003', 'paula@p.test', 'shipper');
select tests.new_user('a5000000-0000-4000-8000-000000000004', 'ana@a.test', 'carrier');
select tests.new_user('a5000000-0000-4000-8000-000000000005', 'beto@b.test', 'carrier');
select tests.new_user('a5000000-0000-4000-8000-000000000006', 'ciro@c.test', 'carrier');
select tests.new_user('a5000000-0000-4000-8000-000000000007', 'oscar@a.test', 'operator');
select tests.new_user('a5000000-0000-4000-8000-000000000008', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c5000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c5000000-0000-4000-8000-000000000002', 'shipper', 'Tiendas Tau SA de CV', 'TTA030303EF3', 'approved'),
  ('c5000000-0000-4000-8000-000000000003', 'shipper', 'Pendiente Pi SA de CV', 'PPI030303EF3', 'pending_review'),
  ('c5000000-0000-4000-8000-000000000004', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved'),
  ('c5000000-0000-4000-8000-000000000005', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved'),
  ('c5000000-0000-4000-8000-000000000006', 'carrier', 'Carga Ciro SA de CV', 'CCI020202CD2', 'pending_review');

update public.profiles p set company_id = c.id
from (values
  ('a5000000-0000-4000-8000-000000000001'::uuid, 'c5000000-0000-4000-8000-000000000001'::uuid),
  ('a5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000002'),
  ('a5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000003'),
  ('a5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000004'),
  ('a5000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000005'),
  ('a5000000-0000-4000-8000-000000000006', 'c5000000-0000-4000-8000-000000000006'),
  ('a5000000-0000-4000-8000-000000000007', 'c5000000-0000-4000-8000-000000000004')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a5000000-0000-4000-8000-000000000008';

insert into public.operators (company_id, profile_id, full_name) values
  ('c5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000007', 'Óscar Operador');
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000004', 'trailer', 'AAA1111', 'dry_van', 30000),
  ('e5000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000005', 'trailer', 'BBB1111', 'dry_van', 30000);

-- ---------------------------------------------------------------------------
-- Shipper S: drafts, validation and publishing
-- ---------------------------------------------------------------------------
select tests.login('a5000000-0000-4000-8000-000000000001');
set local role authenticated;

insert into tests.vals select 'load1', public.create_load(tests.payload());
select is(
  (select status::text from public.loads where id = tests.val('load1')), 'draft', 'create_load stores a draft'
);
select ok(
  (select origin_city = 'Monterrey' and origin_place_id = 'mty' and destination_place_id is null
          and weight_kg = 18000.5 and special_requirements = '{tarp}' and proposed_price_cents = 3500000
          and extensions.st_y(origin_location::extensions.geometry) = 25.6866
   from public.loads where id = tests.val('load1')),
  'the payload is stored field by field, with the origin point derived from lat/lng'
);

select throws_ok(
  $$ select public.create_load(tests.payload() - 'origin') $$, '22023', null, 'a load needs an origin'
);
select throws_ok(
  $$ select public.create_load(tests.payload('{"proposedPriceCents": 100.5}')) $$, '22023', null,
  'money is integer cents: fractions are rejected'
);
select throws_ok(
  $$ select public.create_load(tests.payload('{"proposedPriceCents": "100"}')) $$, '22023', null,
  'the price must be a JSON number'
);
select throws_ok(
  $$ select public.create_load(tests.payload('{"cargoType": "plutonium"}')) $$, '22023', null,
  'unknown cargo types are rejected'
);
select throws_ok(
  $$ select public.create_load(tests.payload('{"specialRequirements": ["tarp", "tarp"]}')) $$, '22023', null,
  'duplicated requirements are rejected'
);
select throws_ok(
  $$ select public.create_load(tests.payload(jsonb_build_object('destination', tests.payload() -> 'origin'))) $$,
  '22023', null,
  'origin and destination cannot be the same place'
);
select throws_ok(
  $$ select public.create_load(tests.payload(
       '{"origin": {"address": "x", "city": "Nueva York", "state": "NY", "lat": 40.71, "lng": -74.0}}')) $$,
  '22023', null,
  'places outside Mexico are rejected'
);
select throws_ok(
  $$ select public.create_load(tests.payload(jsonb_build_object(
       'deliveryWindow', jsonb_build_object('start', now() - interval '2 days', 'end', now() - interval '1 day')))) $$,
  '22023', null,
  'delivery cannot end before pickup starts'
);
select throws_ok(
  $$ select public.create_load(tests.payload('{"weightKg": 90000}')) $$, '22023', null, 'weight is capped at 80 t'
);

select throws_ok(
  $$ insert into public.loads (shipper_company_id, origin_address, origin_city, origin_state, origin_lat, origin_lng,
       destination_address, destination_city, destination_state, destination_lat, destination_lng,
       pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end, cargo_type, description,
       weight_kg, unit_type, proposed_price_cents)
     values ('c5000000-0000-4000-8000-000000000001', 'a', 'b', 'c', 25, -100, 'a', 'b', 'c', 20, -103,
       now(), now() + interval '1 h', now(), now() + interval '2 h', 'general', 'x', 1, 'dry_van', 1) $$,
  '42501', null,
  'clients cannot insert loads directly'
);
select throws_ok(
  $$ update public.loads set status = 'published' where id = tests.val('load1') $$,
  '42501', null,
  'clients cannot update a load status directly'
);
select throws_ok(
  $$ delete from public.loads where id = tests.val('load1') $$, '42501', null, 'clients cannot delete loads'
);

select lives_ok(
  $$ select public.update_load(tests.val('load1'), tests.payload('{"proposedPriceCents": 3600000}')) $$,
  'the shipper edits its draft'
);
select lives_ok($$ select public.publish_load(tests.val('load1')) $$, 'an approved shipper publishes its draft');
select is(
  (select status::text from public.loads where id = tests.val('load1')), 'published', 'the load is published'
);
select throws_ok(
  $$ select public.publish_load(tests.val('load1')) $$, '55000', null, 'a published load cannot be published again'
);

-- Two more loads for the cancellation and suspension scenarios.
insert into tests.vals select 'load2', public.create_load(tests.payload());
insert into tests.vals select 'load3', public.create_load(tests.payload());
select public.publish_load(tests.val('load2'));
select public.publish_load(tests.val('load3'));
-- A draft that stays a draft.
insert into tests.vals select 'draft', public.create_load(tests.payload());

-- ---------------------------------------------------------------------------
-- Other shippers and carriers cannot act on S's loads
-- ---------------------------------------------------------------------------
select tests.login('a5000000-0000-4000-8000-000000000002');
select is((select count(*) from public.loads), 0::bigint, 'another shipper sees no loads of S');
select throws_ok(
  $$ select public.update_load(tests.val('load1'), tests.payload()) $$, '42501', null,
  'another shipper cannot edit the load'
);
select throws_ok(
  $$ select public.cancel_load(tests.val('load1')) $$, '42501', null, 'another shipper cannot cancel the load'
);
select throws_ok(
  $$ select public.make_offer(tests.val('load1'), 100) $$, '42501', null, 'shippers cannot make offers'
);

select tests.login('a5000000-0000-4000-8000-000000000003');
insert into tests.vals select 'draftP', public.create_load(tests.payload());
select is(
  (select count(*) from public.loads where id = tests.val('draftP')), 1::bigint,
  'a shipper in review may prepare drafts'
);
select throws_ok(
  $$ select public.publish_load(tests.val('draftP')) $$, '42501', null, 'a shipper in review cannot publish'
);

select tests.login('a5000000-0000-4000-8000-000000000006');
select is((select count(*) from public.loads), 0::bigint, 'a carrier in review sees no published loads');
select throws_ok(
  $$ select public.make_offer(tests.val('load1'), 100) $$, '42501', null, 'a carrier in review cannot offer'
);

select tests.login('a5000000-0000-4000-8000-000000000007');
select is((select count(*) from public.loads), 0::bigint, 'an operator sees no loads');
select throws_ok(
  $$ select public.make_offer(tests.val('load1'), 100) $$, '42501', null, 'operators cannot offer'
);
select throws_ok(
  $$ select public.create_load(tests.payload()) $$, '42501', null, 'operators cannot create loads'
);

-- ---------------------------------------------------------------------------
-- Carrier A: visibility and offers
-- ---------------------------------------------------------------------------
select tests.login('a5000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select count(*) from public.loads where id in (tests.val('load1'), tests.val('load2'), tests.val('load3')) $$,
  $$ values (3::bigint) $$,
  'an approved carrier sees published loads'
);
select is(
  (select count(*) from public.loads where id in (tests.val('draft'), tests.val('draftP'))), 0::bigint,
  'carriers never see drafts'
);
select throws_ok(
  $$ select public.create_load(tests.payload()) $$, '42501', null, 'carriers cannot create loads'
);
select throws_ok(
  $$ select public.make_offer(tests.val('draft'), 100) $$, '42501', null, 'drafts are not found by carriers'
);
select throws_ok(
  $$ select public.make_offer(tests.val('load1'), 3000000, null, 'e5000000-0000-4000-8000-000000000005') $$,
  '22023', null,
  'a carrier cannot propose a unit of another company'
);
select throws_ok(
  $$ select public.make_offer(tests.val('load1'), 0) $$, '22023', null, 'an offer needs a positive amount'
);
insert into tests.vals
select 'offerA1', public.make_offer(tests.val('load1'), 3000000, 'Pago a 15 días', 'e5000000-0000-4000-8000-000000000004');
select is(
  (select status::text from public.loads where id = tests.val('load1')), 'negotiating',
  'the first offer moves the load to negotiating'
);
select throws_ok(
  $$ select public.make_offer(tests.val('load1'), 2900000) $$, '55000', null,
  'one pending offer per negotiation'
);
select throws_ok(
  $$ select public.accept_offer(tests.val('offerA1')) $$, '42501', null, 'a carrier cannot accept its own offer'
);
select throws_ok(
  $$ select public.reject_offer(tests.val('offerA1')) $$, '42501', null, 'a carrier cannot reject its own offer'
);
select throws_ok(
  $$ insert into public.offers (negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents)
     select negotiation_id, load_id, shipper_company_id, carrier_company_id, 'carrier', 1
     from public.offers where id = tests.val('offerA1') $$,
  '42501', null,
  'clients cannot insert offers directly'
);
select throws_ok(
  $$ update public.offers set status = 'accepted' where id = tests.val('offerA1') $$,
  '42501', null,
  'clients cannot update an offer status directly'
);
insert into tests.vals select 'offerA3', public.make_offer(tests.val('load3'), 3000000);
insert into tests.vals select 'offerA2', public.make_offer(tests.val('load2'), 3000000);

-- Carrier B offers on load1 too.
select tests.login('a5000000-0000-4000-8000-000000000005');
insert into tests.vals select 'offerB1', public.make_offer(tests.val('load1'), 3100000);
select is((select count(*) from public.negotiations), 1::bigint, 'a carrier sees only its own negotiation');
select is((select count(*) from public.offers), 1::bigint, 'a carrier sees only its own offers');
select throws_ok(
  $$ select public.withdraw_offer(tests.val('offerA1')) $$, '42501', null,
  'a carrier cannot withdraw another carrier''s offer'
);

select tests.login('a5000000-0000-4000-8000-000000000002');
select is((select count(*) from public.negotiations), 0::bigint, 'another shipper sees no negotiations');
select is((select count(*) from public.offers), 0::bigint, 'another shipper sees no offers');
select throws_ok(
  $$ select public.accept_offer(tests.val('offerA1')) $$, '42501', null,
  'another shipper cannot accept the offer'
);

-- ---------------------------------------------------------------------------
-- Counteroffers, rejection and withdrawal
-- ---------------------------------------------------------------------------
select tests.login('a5000000-0000-4000-8000-000000000001');
select is(
  (select count(*) from public.negotiations where load_id = tests.val('load1')), 2::bigint,
  'the shipper sees every negotiation of its load'
);
select throws_ok(
  $$ select public.counter_offer(tests.val('offerA1'), 3200000, null, 'e5000000-0000-4000-8000-000000000004') $$,
  '22023', null,
  'shippers do not propose units'
);
insert into tests.vals select 'counterS1', public.counter_offer(tests.val('offerA1'), 3200000, 'Carga a las 8:00');
select results_eq(
  $$ select status::text, side::text from public.offers
     where id in (tests.val('offerA1'), tests.val('counterS1')) order by created_at, side $$,
  $$ values ('countered', 'carrier'), ('pending', 'shipper') $$,
  'counter_offer closes the offer and opens one from the other side'
);
select is(
  (select parent_offer_id from public.offers where id = tests.val('counterS1')), tests.val('offerA1'),
  'the counteroffer points to the offer it answers'
);
select throws_ok(
  $$ select public.accept_offer(tests.val('offerA1')) $$, '55000', null, 'a countered offer cannot be accepted'
);

select tests.login('a5000000-0000-4000-8000-000000000005');
select lives_ok($$ select public.withdraw_offer(tests.val('offerB1')) $$, 'a carrier withdraws its own offer');

select tests.login('a5000000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.reject_offer(tests.val('counterS1'), 'Precio bajo') $$, 'the carrier rejects the counteroffer'
);
select is(
  (select status::text from public.loads where id = tests.val('load1')), 'published',
  'with no pending offers the load goes back to published'
);
insert into tests.vals select 'offerA1b', public.make_offer(tests.val('load1'), 3150000);
select is(
  (select status::text from public.loads where id = tests.val('load1')), 'negotiating',
  'a new offer in the same negotiation reopens it'
);

select tests.login('a5000000-0000-4000-8000-000000000005');
insert into tests.vals select 'offerB1b', public.make_offer(tests.val('load1'), 3050000);

-- ---------------------------------------------------------------------------
-- accept_offer
-- ---------------------------------------------------------------------------
select tests.login('a5000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.update_load(tests.val('load1'), tests.payload('{"notes": "Rampa 3"}')) $$,
  'a load under negotiation can still be edited'
);
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offerA1b'));
select results_eq(
  $$ select status::text, carrier_company_id, agreed_price_cents, accepted_offer_id, contracted_at is not null
     from public.loads where id = tests.val('load1') $$,
  $$ values ('contracted', 'c5000000-0000-4000-8000-000000000004'::uuid, 3150000::bigint, tests.val('offerA1b'), true) $$,
  'accepting contracts the load with the carrier at the offered price'
);
select results_eq(
  $$ select status::text, status_reason from public.offers where id = tests.val('offerB1b') $$,
  $$ values ('rejected', 'other_offer_accepted') $$,
  'the other pending offers of the load are rejected'
);
select is(
  (select count(*) from public.offers where load_id = tests.val('load1') and status = 'accepted'), 1::bigint,
  'exactly one accepted offer'
);
select todo('B06: accept_offer creates the trip', 1);
select isnt(tests.val('trip1'), null, 'accept_offer returns the new trip id');

select throws_ok(
  $$ select public.accept_offer(tests.val('offerB1b')) $$, '55000', null, 'a rejected offer cannot be accepted'
);
select throws_ok(
  $$ select public.cancel_load(tests.val('load1')) $$, '55000', null,
  'a contracted load is not cancelled with cancel_load'
);
select throws_ok(
  $$ select public.update_load(tests.val('load1'), tests.payload()) $$, '55000', null,
  'a contracted load cannot be edited'
);

select tests.login('a5000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.make_offer(tests.val('load1'), 100) $$, '55000', null, 'a contracted load accepts no offers'
);
select is(
  (select count(*) from public.loads where id = tests.val('load1')), 0::bigint,
  'a losing carrier no longer sees the load (nor the winner or the agreed price)'
);
select results_eq(
  $$ select status::text, status_reason from public.offers where id = tests.val('offerB1b') $$,
  $$ values ('rejected', 'other_offer_accepted') $$,
  'a losing carrier still sees why its offer was closed'
);

select tests.login('a5000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select status::text, agreed_price_cents from public.loads where id = tests.val('load1') $$,
  $$ values ('contracted', 3150000::bigint) $$,
  'the winning carrier sees the contracted load and the agreed price'
);

select tests.login('a5000000-0000-4000-8000-000000000006');
select is(
  (select count(*) from public.loads where id = tests.val('load1')), 0::bigint,
  'unrelated carriers stop seeing a contracted load'
);

-- ---------------------------------------------------------------------------
-- Approval gate at acceptance time, cancellation and admin audit
-- ---------------------------------------------------------------------------
reset role;
update public.companies set status = 'suspended' where id = 'c5000000-0000-4000-8000-000000000004';
select tests.login('a5000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$ select public.accept_offer(tests.val('offerA3')) $$, '55000', null,
  'an offer from a suspended carrier cannot be accepted'
);
reset role;
update public.companies set status = 'approved' where id = 'c5000000-0000-4000-8000-000000000004';
select tests.login('a5000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok($$ select public.cancel_load(tests.val('load2'), 'Ya no se necesita') $$, 'the shipper cancels');
select results_eq(
  $$ select l.status::text, l.cancellation_reason, o.status::text, o.status_reason
     from public.loads l join public.offers o on o.load_id = l.id where l.id = tests.val('load2') $$,
  $$ values ('cancelled', 'Ya no se necesita', 'rejected', 'load_cancelled') $$,
  'cancelling closes the pending offers'
);
select throws_ok(
  $$ select public.accept_offer(tests.val('offerA2')) $$, '55000', null, 'offers of a cancelled load are closed'
);

select tests.login('a5000000-0000-4000-8000-000000000008');
select is((select count(*) from public.offers where load_id = tests.val('load3')), 1::bigint, 'admins see offers');
select lives_ok($$ select public.cancel_load(tests.val('load3'), 'Duplicada') $$, 'an admin cancels a load');
select is(
  (select count(*) from public.audit_log
   where table_name = 'loads' and record_id = tests.val('load3')
     and company_id = 'c5000000-0000-4000-8000-000000000001'
     and actor_id = 'a5000000-0000-4000-8000-000000000008'),
  1::bigint,
  'the admin cancellation is audited under the shipper company'
);

-- ---------------------------------------------------------------------------
-- Pickup deadline: once the pickup window ended, pending offers can only be
-- closed (rejected or withdrawn), never countered or accepted.
-- ---------------------------------------------------------------------------
select tests.login('a5000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load4', public.create_load(tests.payload());
select public.publish_load(tests.val('load4'));
select tests.login('a5000000-0000-4000-8000-000000000004');
insert into tests.vals select 'offerA4', public.make_offer(tests.val('load4'), 3000000);
select tests.login('a5000000-0000-4000-8000-000000000005');
insert into tests.vals select 'offerB4', public.make_offer(tests.val('load4'), 3100000);
reset role;
update public.loads
set pickup_window_start = now() - interval '2 hours', pickup_window_end = now() - interval '1 hour'
where id = tests.val('load4');
select tests.login('a5000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$ select public.accept_offer(tests.val('offerA4')) $$, '55000', null,
  'an offer cannot be accepted after the pickup window ended'
);
select throws_ok(
  $$ select public.counter_offer(tests.val('offerA4'), 2900000) $$, '55000', null,
  'an offer cannot be countered after the pickup window ended'
);
select lives_ok(
  $$ select public.reject_offer(tests.val('offerB4')) $$, 'an offer can still be rejected after the pickup window'
);
select tests.login('a5000000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.withdraw_offer(tests.val('offerA4')) $$, 'an offer can still be withdrawn after the pickup window'
);

-- ---------------------------------------------------------------------------
-- Invariants (as table owner)
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$ update public.offers set status = 'accepted', responded_at = now() where id = tests.val('offerB1b') $$,
  '23505', null,
  'the partial unique index forbids a second accepted offer per load'
);
select ok(
  not has_table_privilege('anon', 'public.loads', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.negotiations', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.offers', 'select,insert,update,delete'),
  'anon has no privileges on loads, negotiations or offers'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_trip_for_accepted_offer(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.apply_load_payload(public.loads, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.lock_offer_for_response(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.lock_company_approved(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.assert_pickup_open(uuid)', 'execute'),
  'internal helpers are not callable by clients'
);

select * from finish();
rollback;
