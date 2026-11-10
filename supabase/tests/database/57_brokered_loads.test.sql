-- I6 · Brokered loads (D39):
--   * privileges: no client writes on load_client_prices; only its shipper and
--     the admins read it; not in Realtime; anon runs no I6 RPC;
--   * the flow: the client sends the load (target price or "Por cotizar"),
--     the admin quotes the client's price and the carriers' rate, the client
--     approves the price it saw and the load is published at the rate;
--   * the carrier never gets the client's price by any path: select on loads
--     and load_client_prices, recommendations (match_candidates), its
--     notifications and the Realtime tables (offers, notifications), the
--     internal and public share links and its side of the freight ledger;
--   * the client never gets the carriers' rate nor their offers: the load row,
--     negotiations, offers, the negotiation helpers and chat, notifications;
--     client_loads() shows it its own price;
--   * only an admin answers the carriers as Transport, never over the
--     client's price; the client cannot answer them;
--   * the ledger: the client's price, commission 0, the carrier's net and the
--     margin, which only the admin reads.
begin;
create extension if not exists pgtap with schema extensions;

select plan(73);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i6.test', now(), null,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;
create table tests.tokens (name text primary key, token text);
grant select, insert on tests.tokens to authenticated, anon;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

create function tests.payload()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Blvd. Venustiano Carranza 200', 'city', 'Saltillo',
                                      'state', 'Coahuila', 'lat', 25.4383, 'lng', -100.9737),
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized', 'description', 'Tarimas intermediadas', 'weightKg', 8000, 'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 999
  );
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

-- One value of p_sql as p_uid.
create function tests.read(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute p_sql into v;
  execute 'reset role';
  return v;
end;
$$;

-- Runs p_sql as p_uid (returns nothing).
create function tests.run(p_uid uuid, p_sql text)
returns void
language plpgsql
as $$
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute p_sql;
  execute 'reset role';
end;
$$;

-- Everything p_sql returns to p_uid, as one text (to look for amounts in it).
create function tests.dump(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute format('select coalesce(string_agg(row_to_json(x)::text, '' ''), '''') from (%s) x', p_sql) into v;
  execute 'reset role';
  return v;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a56…: 01 S shipper, 02 T another shipper, 03 M manager,
-- 04 X manager of another carrier, 05 Z admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a5600000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a5600000-0000-4000-8000-000000000002', 'shipper');
select tests.new_user('a5600000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a5600000-0000-4000-8000-000000000004', 'manager');
select tests.new_user('a5600000-0000-4000-8000-000000000005', 'shipper');
update public.profiles set role = 'admin' where id = 'a5600000-0000-4000-8000-000000000005';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c5600000-0000-4000-8000-000000000001', 'shipper', 'Envíos Intermediados SA de CV', 'EIN050505GH5', 'approved'),
  ('c5600000-0000-4000-8000-000000000002', 'shipper', 'Envíos Otros SA de CV', 'EOI050505GH6', 'approved'),
  ('c5600000-0000-4000-8000-000000000003', 'carrier', 'Fletes Tarifa SA de CV', 'FTA040404CD4', 'approved'),
  ('c5600000-0000-4000-8000-000000000004', 'carrier', 'Fletes Ajenos SA de CV', 'FAI040404CD5', 'approved');
update public.profiles set company_id = 'c5600000-0000-4000-8000-000000000001'
where id = 'a5600000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c5600000-0000-4000-8000-000000000002'
where id = 'a5600000-0000-4000-8000-000000000002';
update public.profiles set company_id = 'c5600000-0000-4000-8000-000000000003'
where id = 'a5600000-0000-4000-8000-000000000003';
update public.profiles set company_id = 'c5600000-0000-4000-8000-000000000004'
where id = 'a5600000-0000-4000-8000-000000000004';

insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e5600000-0000-4000-8000-00000000000a', 'c5600000-0000-4000-8000-000000000003', 'rigid', 'HIN5601', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.id = 'e5600000-0000-4000-8000-00000000000a'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
-- The unit is free in Monterrey now: the brokered load is its recommendation.
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state) values
  ('c5600000-0000-4000-8000-000000000003', 'e5600000-0000-4000-8000-00000000000a', now(),
   'SRID=4326;POINT(-100.3161 25.6866)', 'Monterrey', 'Nuevo León');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.load_client_prices', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.load_client_prices', 'insert,update,delete,truncate'),
  'nobody writes load_client_prices directly and anon cannot read it'
);
select is_empty(
  $$ select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'load_client_prices' $$,
  'the client''s price is not sent by Realtime'
);
select ok(
  not has_function_privilege('anon', 'public.request_brokered_load(jsonb, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.approve_brokered_quote(uuid, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.admin_quote_brokered_load(uuid, bigint, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.admin_brokered_loads()', 'execute')
  and not has_function_privilege('anon', 'public.client_loads()', 'execute'),
  'anon runs no brokered-load RPC'
);
select ok(
  pg_get_function_result('public.carrier_freight_ledger()'::regprocedure) !~ '(client|margin)'
  and pg_get_function_result('public.shipper_freight_ledger()'::regprocedure) !~ '(carrier|margin|net)',
  'neither side''s ledger read has a column of the other side or the margin'
);

-- ---------------------------------------------------------------------------
-- The client sends a load to the platform
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'select public.request_brokered_load(tests.payload(), 0)') $$,
  '22023', NULL, 'the target price must be positive'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000003',
       'select public.request_brokered_load(tests.payload(), null)') $$,
  '42501', NULL, 'a carrier cannot send a load to the platform'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'insert into tests.vals select ''bl'', public.request_brokered_load(tests.payload(), 1150000)') $$,
  'the client sends a load with its target price'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'insert into tests.vals select ''bl2'', public.request_brokered_load(tests.payload(), null)') $$,
  'the client sends a load "Por cotizar"'
);
select results_eq(
  $$ select status::text, brokered, proposed_price_cents, published_at is null from public.loads where id = tests.val('bl') $$,
  $$ values ('draft', true, 0::bigint, true) $$,
  'it waits as an unpublished draft with no rate (the client''s price is never the rate)'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5600000-0000-4000-8000-000000000005' and type = 'brokered_load_requested'
     and data ->> 'loadId' = tests.val('bl')::text),
  1, 'the admins are told'
);
select is(tests.sees('a5600000-0000-4000-8000-000000000001',
  $$ select 1 from public.loads where id = tests.val('bl') $$), 0::bigint,
  'the client does not read the row of its brokered load (it carries the carriers'' rate)');
select results_eq(
  $$ select tests.read('a5600000-0000-4000-8000-000000000001',
       'select row(brokered_status, target_price_cents, proposed_price_cents)::text from public.client_loads() where id = tests.val(''bl'')') $$,
  $$ values ('(requested,1150000,)') $$,
  'client_loads shows the client its request and its target price'
);
select is(tests.sees('a5600000-0000-4000-8000-000000000002',
  $$ select 1 from public.client_loads() where id = tests.val('bl') $$), 0::bigint,
  'another client does not see it');
select is(tests.sees('a5600000-0000-4000-8000-000000000003',
  $$ select 1 from public.loads where id = tests.val('bl') $$), 0::bigint,
  'the carriers do not see it before it is published');
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'select public.update_load(tests.val(''bl''), tests.payload())') $$,
  '55000', 'a brokered load cannot be edited', 'the client cannot edit it (it would set the rate)'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001', 'select public.publish_load(tests.val(''bl''))') $$,
  '55000', NULL, 'nor publish it by itself'
);

-- ---------------------------------------------------------------------------
-- The admin quotes it
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'select public.admin_quote_brokered_load(tests.val(''bl''), 1200000, 1080000)') $$,
  '42501', NULL, 'the client cannot quote'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000003',
       'select public.admin_quote_brokered_load(tests.val(''bl''), 1200000, 1080000)') $$,
  '42501', NULL, 'a carrier cannot quote'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'select public.admin_quote_brokered_load(tests.val(''bl''), 1000000, 1080000)') $$,
  '22023', NULL, 'the carriers'' rate cannot be over the client''s price'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'select public.admin_quote_brokered_load(tests.val(''bl''), 1200000, 1080000)') $$,
  'the admin quotes $12,000 to the client and $10,800 to the carriers'
);
select results_eq(
  $$ select data ->> 'amountCents', data::text ~ '1080000'
     from public.notifications
     where user_id = 'a5600000-0000-4000-8000-000000000001' and type = 'brokered_load_quoted' $$,
  $$ values ('1200000', false) $$,
  'the client is told its price, never the rate'
);
select is(
  tests.read('a5600000-0000-4000-8000-000000000001',
    'select row(brokered_status, proposed_price_cents)::text from public.client_loads() where id = tests.val(''bl'')'),
  '(quoted,1200000)',
  'the client sees "Esperando tu aprobación" with its price'
);
select ok(
  tests.dump('a5600000-0000-4000-8000-000000000001', 'select * from public.client_loads()') !~ '1080000',
  'the client''s loads never carry the rate'
);
select ok(
  exists (select 1 from public.audit_log
          where table_name = 'load_client_prices' and actor_id = 'a5600000-0000-4000-8000-000000000005'),
  'the quote is audited'
);

-- ---------------------------------------------------------------------------
-- The client approves; the carriers see the rate
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'select public.approve_brokered_quote(tests.val(''bl''), 1150000)') $$,
  '55000', 'the quote changed', 'the client approves only the price it saw'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000002',
       'select public.approve_brokered_quote(tests.val(''bl''), 1200000)') $$,
  '42501', NULL, 'another client cannot approve it'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'select public.approve_brokered_quote(tests.val(''bl''), 1200000)') $$,
  'the client approves its price'
);
select results_eq(
  $$ select l.status::text, l.proposed_price_cents, p.status::text
     from public.loads l join public.load_client_prices p on p.load_id = l.id where l.id = tests.val('bl') $$,
  $$ values ('published', 1080000::bigint, 'approved') $$,
  'the load is published at the carriers'' rate'
);
select is(
  tests.read('a5600000-0000-4000-8000-000000000003',
    'select row(brokered, proposed_price_cents)::text from public.loads where id = tests.val(''bl'')'),
  '(t,1080000)',
  'the carrier sees the load at its rate, marked as published by Transport'
);
select is(tests.sees('a5600000-0000-4000-8000-000000000003',
  $$ select 1 from public.load_client_prices $$), 0::bigint,
  'the carrier cannot read the client''s price');
select ok(
  tests.dump('a5600000-0000-4000-8000-000000000003', 'select * from public.loads where id = tests.val(''bl'')') !~ '1200000',
  'nor find it in the load''s row'
);
select ok(
  tests.dump('a5600000-0000-4000-8000-000000000003',
    'select * from public.match_candidates(''e5600000-0000-4000-8000-00000000000a'')') ~ tests.val('bl')::text
  and tests.dump('a5600000-0000-4000-8000-000000000003',
    'select * from public.match_candidates(''e5600000-0000-4000-8000-00000000000a'')') !~ '1200000',
  'its recommendations show the load without the client''s price'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'select public.admin_quote_brokered_load(tests.val(''bl''), 1250000, 1080000)') $$,
  '55000', 'the client already approved its price', 'once approved, the client''s price does not change'
);

-- Share links: the carrier's internal link shows the rate, the client's
-- public link shows no price.
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000003',
       'insert into tests.tokens select ''internal'', token from public.create_share_link(''load_internal'', tests.val(''bl''))') $$,
  'the carrier shares the load inside its company'
);
select ok(
  tests.dump('a5600000-0000-4000-8000-000000000003',
    'select public.open_internal_share((select token from tests.tokens where name = ''internal'')) as v') !~ '1200000',
  'the internal link never carries the client''s price'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'insert into tests.tokens select ''public'', token from public.create_share_link(''load_public'', tests.val(''bl''))') $$,
  'the client shares its load publicly'
);
set local role anon;
select ok(
  (select public.public_shared_load((select token from tests.tokens where name = 'public'))::text) !~ '(1200000|1080000)',
  'the public link carries no price at all'
);
reset role;

-- ---------------------------------------------------------------------------
-- Negotiation: the carrier with Transport, never with the client
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000003',
       'insert into tests.vals select ''offer1'', public.make_offer(tests.val(''bl''), 1250000, null, ''e5600000-0000-4000-8000-00000000000a'')') $$,
  'the carrier offers on the brokered load'
);
insert into tests.vals select 'neg', negotiation_id from public.offers where id = tests.val('offer1');
insert into tests.vals select 'conv', id from public.conversations where negotiation_id = tests.val('neg');
select is(tests.sees('a5600000-0000-4000-8000-000000000001',
  $$ select 1 from public.offers where load_id = tests.val('bl') $$), 0::bigint,
  'the client does not read the carriers'' offers');
select is(tests.sees('a5600000-0000-4000-8000-000000000001',
  $$ select 1 from public.negotiations where load_id = tests.val('bl') $$), 0::bigint,
  'nor their negotiations');
select is(tests.sees('a5600000-0000-4000-8000-000000000001',
  $$ select 1 from public.load_negotiation_carriers(tests.val('bl')) $$), 0::bigint,
  'nor who negotiates it');
select is(tests.sees('a5600000-0000-4000-8000-000000000001',
  $$ select 1 from public.load_offer_vehicles(tests.val('bl')) $$), 0::bigint,
  'nor the units they propose');
select is(tests.sees('a5600000-0000-4000-8000-000000000005',
  $$ select 1 from public.load_negotiation_carriers(tests.val('bl')) $$), 1::bigint,
  'the admin sees who negotiates it');
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5600000-0000-4000-8000-000000000001' and type in ('offer_received', 'counter_offer_received')),
  0, 'the client is not told about the carriers'' offers'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5600000-0000-4000-8000-000000000005' and type = 'offer_received'
     and (data ->> 'brokered')::boolean and data ->> 'loadId' = tests.val('bl')::text),
  1, 'the admins are, marked as brokered'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'select public.accept_offer(tests.val(''offer1''))') $$,
  '42501', 'offer not found', 'the client cannot accept a carrier''s offer'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001',
       'select public.counter_offer(tests.val(''offer1''), 1000000)') $$,
  '42501', 'offer not found', 'nor counter it'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000004',
       'select public.counter_offer(tests.val(''offer1''), 1000000)') $$,
  '42501', 'offer not found', 'nor can another carrier'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'select public.accept_offer(tests.val(''offer1''))') $$,
  '22023', 'the carrier price cannot be over the client price',
  'Transport never accepts over the client''s price'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'select public.counter_offer(tests.val(''offer1''), 1300000)') $$,
  '22023', 'the carrier price cannot be over the client price', 'nor counters over it'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'insert into tests.vals select ''offer2'', public.counter_offer(tests.val(''offer1''), 1080000)') $$,
  'the admin counters at the rate, in the name of Transport'
);
select results_eq(
  $$ select side::text, created_by from public.offers where id = tests.val('offer2') $$,
  $$ values ('shipper', 'a5600000-0000-4000-8000-000000000005'::uuid) $$,
  'the counteroffer is Transport''s (the shipper side), made by the admin'
);
select ok(
  tests.dump('a5600000-0000-4000-8000-000000000003', 'select * from public.offers where load_id = tests.val(''bl'')') !~ '1200000'
  and tests.dump('a5600000-0000-4000-8000-000000000003', 'select * from public.notifications') !~ '1200000',
  'the carrier''s offers and notifications (what Realtime sends it) never carry the client''s price'
);
select ok(
  not tests.read('a5600000-0000-4000-8000-000000000003', 'select public.is_conversation_participant(tests.val(''conv''))')::boolean
  and tests.sees('a5600000-0000-4000-8000-000000000001',
    $$ select 1 from public.conversations where load_id = tests.val('bl') $$) = 0,
  'the negotiation chat of a brokered load is closed: no carrier writes and the client reads nothing'
);
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000003',
       'select public.send_message(tests.val(''conv''), ''hola'')') $$,
  '42501', NULL, 'the carrier cannot write in it'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000003',
       'insert into tests.vals select ''trip'', public.accept_offer(tests.val(''offer2''))') $$,
  'the carrier takes it at $10,800'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5600000-0000-4000-8000-000000000001' and type = 'brokered_load_contracted'
     and data ->> 'tripId' = tests.val('trip')::text and not data ? 'amountCents'),
  1, 'the client is told Transport found the carrier, without any amount'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5600000-0000-4000-8000-000000000001' and type = 'offer_accepted'),
  0, 'and not that a carrier accepted Transport''s offer'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5600000-0000-4000-8000-000000000005' and type = 'offer_accepted'
     and (data ->> 'brokered')::boolean),
  1, 'the admins are'
);

-- ---------------------------------------------------------------------------
-- The ledger and the reads after the contract
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select client_amount_cents, commission_bps, commission_cents, carrier_net_cents, margin_cents
     from public.freight_ledgers where trip_id = tests.val('trip') $$,
  $$ values (1200000::bigint, 0, 0::bigint, 1080000::bigint, 120000::bigint) $$,
  'the ledger: $12,000 from the client, no commission, $10,800 to the carrier and $1,200 of margin'
);
select is(
  tests.read('a5600000-0000-4000-8000-000000000001',
    'select row(amount_cents)::text from public.shipper_freight_ledger() where trip_id = tests.val(''trip'')'),
  '(1200000)', 'the client owes its price'
);
select ok(
  tests.dump('a5600000-0000-4000-8000-000000000001', 'select * from public.shipper_freight_ledger()') !~ '(1080000|120000[^0-9])'
  and tests.dump('a5600000-0000-4000-8000-000000000001', 'select * from public.client_loads()') !~ '1080000',
  'and never sees the carrier''s price nor the margin'
);
select is(
  tests.read('a5600000-0000-4000-8000-000000000003',
    'select row(freight_cents, commission_cents, net_cents)::text from public.carrier_freight_ledger() where trip_id = tests.val(''trip'')'),
  '(1080000,0,1080000)', 'the carrier is owed its price, with no commission'
);
select ok(
  tests.dump('a5600000-0000-4000-8000-000000000003', 'select * from public.carrier_freight_ledger()') !~ '(1200000|120000[^0-9])',
  'and never sees the client''s price nor the margin'
);
select is(
  tests.read('a5600000-0000-4000-8000-000000000005',
    'select margin_cents::text from public.admin_freight_ledger() where trip_id = tests.val(''trip'')'),
  '120000', 'the admin reads the margin'
);
select is(
  tests.read('a5600000-0000-4000-8000-000000000001',
    'select row(status, agreed_price_cents)::text from public.client_loads() where id = tests.val(''bl'')'),
  '(contracted,1200000)', 'the client sees its load contracted at its price'
);
select is(tests.sees('a5600000-0000-4000-8000-000000000001',
  $$ select 1 from public.trips where id = tests.val('trip') $$), 1::bigint,
  'and follows the trip as any other');
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'select public.admin_quote_brokered_load(tests.val(''bl''), 1200000, 1000000)') $$,
  '55000', NULL, 'the rate does not change after the contract'
);

-- ---------------------------------------------------------------------------
-- Admin inbox and the rate of a published load
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000003', 'select count(*) from public.admin_brokered_loads()') $$,
  '42501', NULL, 'only admins list the brokered loads'
);
select results_eq(
  $$ select tests.read('a5600000-0000-4000-8000-000000000005',
       'select row(quote_status, target_price_cents, client_price_cents, carrier_price_cents)::text from public.admin_brokered_loads() where load_id = tests.val(''bl2'')') $$,
  $$ values ('(requested,,,)') $$,
  'the admin sees a request "Por cotizar" with no prices yet'
);
select tests.run('a5600000-0000-4000-8000-000000000005',
  'select public.admin_quote_brokered_load(tests.val(''bl2''), 900000, 800000)');
select tests.run('a5600000-0000-4000-8000-000000000001',
  'select public.approve_brokered_quote(tests.val(''bl2''), 900000)');
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000005',
       'select public.admin_quote_brokered_load(tests.val(''bl2''), 900000, 850000)') $$,
  'the admin can raise the rate of a published load'
);
select is(
  (select proposed_price_cents from public.loads where id = tests.val('bl2')), 850000::bigint,
  'the carriers see the new rate'
);
select lives_ok(
  $$ select tests.run('a5600000-0000-4000-8000-000000000001', 'select public.cancel_load(tests.val(''bl2''), null)') $$,
  'the client can still cancel its brokered load'
);

select * from finish();
rollback;
