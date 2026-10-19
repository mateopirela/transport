-- Client offers inbox (B14): who may read the carriers negotiating a load and
-- the units proposed in its offers (role matrix), what those views expose, and
-- the tables published to Realtime for the inbox, receipts and the badge.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_email text, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email, now(), case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end, jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
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

grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S1 and ...02 shipper S2 (company S)   ...03 shipper T
--        ...04 carrier A   ...05 carrier B   ...06 operator O of A   ...07 admin
select tests.new_user('a8000000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a8000000-0000-4000-8000-000000000002', 'sofia@s.test', 'shipper');
select tests.new_user('a8000000-0000-4000-8000-000000000003', 'tomas@t.test', 'shipper');
select tests.new_user('a8000000-0000-4000-8000-000000000004', 'ana@a.test', 'manager');
select tests.new_user('a8000000-0000-4000-8000-000000000005', 'beto@b.test', 'manager');
select tests.new_user('a8000000-0000-4000-8000-000000000006', 'oscar@a.test', 'operator');
select tests.new_user('a8000000-0000-4000-8000-000000000007', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c8000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c8000000-0000-4000-8000-000000000002', 'shipper', 'Tiendas Tau SA de CV', 'TTA030303EF3', 'approved'),
  ('c8000000-0000-4000-8000-000000000003', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved'),
  ('c8000000-0000-4000-8000-000000000004', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved');

update public.profiles p set company_id = c.id
from (values
  ('a8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid),
  ('a8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001'),
  ('a8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000002'),
  ('a8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000003'),
  ('a8000000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000004'),
  ('a8000000-0000-4000-8000-000000000006', 'c8000000-0000-4000-8000-000000000003')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a8000000-0000-4000-8000-000000000007';

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d8000000-0000-4000-8000-000000000006', 'c8000000-0000-4000-8000-000000000003',
   'a8000000-0000-4000-8000-000000000006', 'Óscar Operador');
insert into public.vehicles (id, company_id, kind, plate, fleet_number, unit_type, capacity_kg, capacity_m3, features)
values
  ('e8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000003', 'rigid', 'AAA1111', 'ECO-7',
   'dry_van', 30000, 70, '{liftgate}'),
  -- Never proposed: must not show up.
  ('e8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000003', 'rigid', 'AAA2222', null,
   'dry_van', 30000, null, '{}');

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.load_negotiation_carriers(uuid)', 'execute'),
  'anon cannot read the carriers of a load'
);
select ok(
  not has_function_privilege('anon', 'public.load_offer_vehicles(uuid)', 'execute'),
  'anon cannot read the proposed units of a load'
);
select ok(
  not exists (
    select 1 from pg_proc p
    where p.proname = 'load_offer_vehicles'
      and ('plate' = any (p.proargnames) or 'fleet_number' = any (p.proargnames))
  ),
  'proposed units are returned without plate or fleet number'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
  ),
  format('%s are published to Realtime', t)
)
from unnest(array['offers', 'message_reads', 'notifications']) t;

-- ---------------------------------------------------------------------------
-- Fixture: a load of S with offers from A (with a unit) and B (without).
-- ---------------------------------------------------------------------------
set local role authenticated;

select tests.login('a8000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload());
select public.publish_load(tests.val('load1'));
insert into tests.vals select 'load2', public.create_load(tests.payload());
select public.publish_load(tests.val('load2'));

select tests.login('a8000000-0000-4000-8000-000000000004');
insert into tests.vals
select 'offerA', public.make_offer(tests.val('load1'), 3400000, null, 'e8000000-0000-4000-8000-000000000003');
select tests.login('a8000000-0000-4000-8000-000000000005');
insert into tests.vals select 'offerB', public.make_offer(tests.val('load1'), 3300000);

-- ---------------------------------------------------------------------------
-- load_negotiation_carriers: role matrix
-- ---------------------------------------------------------------------------
select tests.login('a8000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select carrier_legal_name, carrier_status::text, conversation_id is not null
     from public.load_negotiation_carriers(tests.val('load1')) order by carrier_legal_name $$,
  $$ values ('Fletes Alfa SA de CV', 'approved', true), ('Transportes Beta SA de CV', 'approved', true) $$,
  'the shipper sees each carrier with its verification status and conversation'
);
select is(
  (select array_agg(c.id order by c.id) from public.load_negotiation_carriers(tests.val('load1')) r
   join public.conversations c on c.id = r.conversation_id and c.negotiation_id = r.negotiation_id),
  (select array_agg(c.id order by c.id) from public.conversations c where c.load_id = tests.val('load1')),
  'each row carries the conversation of its own negotiation'
);
select is(
  (select count(*) from public.load_negotiation_carriers(tests.val('load2'))), 0::bigint,
  'a load without offers has no carriers'
);
select tests.login('a8000000-0000-4000-8000-000000000002');
select is(
  (select count(*) from public.load_negotiation_carriers(tests.val('load1'))), 2::bigint,
  'every shipper of the company sees them'
);
select tests.login('a8000000-0000-4000-8000-000000000003');
select is(
  (select count(*) from public.load_negotiation_carriers(tests.val('load1'))), 0::bigint,
  'another shipper sees nothing'
);
select tests.login('a8000000-0000-4000-8000-000000000004');
select is(
  (select count(*) from public.load_negotiation_carriers(tests.val('load1'))), 0::bigint,
  'a negotiating carrier does not see its competitors'
);
select tests.login('a8000000-0000-4000-8000-000000000006');
select is(
  (select count(*) from public.load_negotiation_carriers(tests.val('load1'))), 0::bigint,
  'an operator sees nothing'
);
select tests.login('a8000000-0000-4000-8000-000000000007');
select is(
  (select count(*) from public.load_negotiation_carriers(tests.val('load1'))), 2::bigint,
  'an admin sees them'
);

-- Unread messages: counted per caller, from their read marker.
select tests.login('a8000000-0000-4000-8000-000000000004');
select public.send_message(r.conversation_id, 'Hola')
from (select c.id as conversation_id from public.conversations c
      join public.offers o on o.negotiation_id = c.negotiation_id where o.id = tests.val('offerA')) r;
select tests.login('a8000000-0000-4000-8000-000000000001');
select is(
  (select sum(unread_messages) from public.load_negotiation_carriers(tests.val('load1'))), 1::numeric,
  'the shipper has one unread message from the carrier'
);
select public.mark_conversation_read(conversation_id)
from public.load_negotiation_carriers(tests.val('load1')) where unread_messages > 0;
select is(
  (select sum(unread_messages) from public.load_negotiation_carriers(tests.val('load1'))), 0::numeric,
  'marking the conversation as read clears it'
);

-- ---------------------------------------------------------------------------
-- load_offer_vehicles: role matrix and content
-- ---------------------------------------------------------------------------
select tests.login('a8000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select vehicle_id, kind::text, unit_type::text, capacity_kg, capacity_m3, features::text[], documents_complete
     from public.load_offer_vehicles(tests.val('load1')) $$,
  $$ values ('e8000000-0000-4000-8000-000000000003'::uuid, 'rigid', 'dry_van', 30000, 70.00::numeric,
             array['liftgate'], false) $$,
  'the shipper sees only the proposed unit, and that its documents are incomplete'
);
select is(
  (select count(*) from public.load_offer_vehicles(tests.val('load2'))), 0::bigint,
  'no units for a load without offers'
);
select tests.login('a8000000-0000-4000-8000-000000000003');
select is(
  (select count(*) from public.load_offer_vehicles(tests.val('load1'))), 0::bigint,
  'another shipper sees no unit'
);
select tests.login('a8000000-0000-4000-8000-000000000005');
select is(
  (select count(*) from public.load_offer_vehicles(tests.val('load1'))), 0::bigint,
  'a competing carrier sees no unit'
);
select tests.login('a8000000-0000-4000-8000-000000000007');
select is(
  (select count(*) from public.load_offer_vehicles(tests.val('load1'))), 1::bigint,
  'an admin sees the proposed unit'
);

-- A countered unit stays visible: the shipper compares the whole history.
select tests.login('a8000000-0000-4000-8000-000000000001');
insert into tests.vals select 'counterA', public.counter_offer(tests.val('offerA'), 3350000);
select is(
  (select count(*) from public.load_offer_vehicles(tests.val('load1'))), 1::bigint,
  'a unit proposed in a countered offer is still listed'
);

-- Complete documents: an approved, unexpired document for every requirement.
reset role;
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select 'c8000000-0000-4000-8000-000000000003', r.id, 'vehicle', 'e8000000-0000-4000-8000-000000000003',
       format('c8000000-0000-4000-8000-000000000003/vehicle/e8000000-0000-4000-8000-000000000003/%s.pdf',
              gen_random_uuid()),
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicle_missing_requirements('e8000000-0000-4000-8000-000000000003') r;
set local role authenticated;
select tests.login('a8000000-0000-4000-8000-000000000001');
select is(
  (select documents_complete from public.load_offer_vehicles(tests.val('load1'))), true,
  'documents_complete turns true once every required document is approved'
);

-- ---------------------------------------------------------------------------
-- Accepting from the inbox closes the other offers in the same transaction.
-- ---------------------------------------------------------------------------
select tests.login('a8000000-0000-4000-8000-000000000001');
select isnt(public.accept_offer(tests.val('offerB')), null, 'the shipper accepts B''s offer and gets a trip');
select results_eq(
  $$ select status::text from public.offers where load_id = tests.val('load1') and status <> 'countered'
     order by amount_cents $$,
  $$ values ('accepted'), ('rejected') $$,
  'the other pending offer is closed'
);
select is(
  (select carrier_status::text from public.load_negotiation_carriers(tests.val('load1'))
   where carrier_legal_name = 'Fletes Alfa SA de CV'),
  'approved',
  'the shipper still sees the losing carrier in its history'
);

select * from finish();
rollback;
