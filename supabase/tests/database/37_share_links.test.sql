-- G7 · Share links (D23): who creates each kind of link, the token (entropy,
-- hashing, never stored), expiry and revocation, the read matrix of
-- share_links (no token_hash for clients, writes only by RPC), the internal
-- link opened by the company's staff and operators only, and the public RPCs
-- (anon) whose JSON is compared with an allowlist of keys: never the price,
-- contacts, exact addresses, documents, chat or the operator.
begin;
create extension if not exists pgtap with schema extensions;

select plan(83);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g7.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.anon()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true);
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
    'description', 'Tarimas de acero (confidencial)',
    'weightKg', 18000,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array('tarp'),
    'proposedPriceCents', 3500000,
    'notes', 'Llamar al 81 1234 5678 al llegar'
  );
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;
create table tests.tokens (name text primary key, token text);
grant select, insert on tests.tokens to anon, authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

create function tests.token(p_name text)
returns text
language sql
stable
as $$ select token from tests.tokens where name = p_name $$;

-- Creates a link as p_uid and keeps its id and token under p_name.
create function tests.share(p_name text, p_uid uuid, p_kind public.share_link_kind, p_load text, p_trip text,
                            p_hours integer default null)
returns void
language plpgsql
as $$
declare
  r record;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  select * into r from public.create_share_link(p_kind, tests.val(p_load), tests.val(p_trip), p_hours);
  execute 'reset role';
  insert into tests.vals values (p_name, r.id);
  insert into tests.tokens values (p_name, r.token);
end;
$$;

-- How many rows of p_sql p_uid sees (anon when null; a closed table counts as 0).
create function tests.sees(p_uid uuid, p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  if p_uid is null then
    perform tests.anon();
    execute 'set local role anon';
  else
    perform tests.login(p_uid);
    execute 'set local role authenticated';
  end if;
  begin
    execute format('select count(*) from (%s) x', p_sql) into v_count;
  exception when insufficient_privilege then
    v_count := 0;
  end;
  execute 'reset role';
  return v_count;
end;
$$;

-- Every key of a JSON document, nested ones as parent.child.
create function tests.json_keys(p_doc jsonb, p_prefix text default '')
returns setof text
language sql
as $$
  select p_prefix || k
  from jsonb_object_keys(p_doc) k
  union all
  select n.key
  from jsonb_each(p_doc) e
  cross join lateral tests.json_keys(e.value, p_prefix || e.key || '.') n(key)
  where jsonb_typeof(e.value) = 'object';
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a37…: 01 S shipper, 02 T another shipper, 03 M manager,
-- 04 A coordinator (unit A), 05 B coordinator (unit B), 06 O operator (unit A),
-- 07 X manager of another approved carrier, 08 admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a3700000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a3700000-0000-4000-8000-000000000002', 'shipper');
select tests.new_user('a3700000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a3700000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a3700000-0000-4000-8000-000000000005', 'coordinator');
select tests.new_user('a3700000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a3700000-0000-4000-8000-000000000007', 'manager');
select tests.new_user('a3700000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin' where id = 'a3700000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c3700000-0000-4000-8000-000000000001', 'shipper', 'Envíos Siete SA de CV', 'ESI070707GH7', 'approved'),
  ('c3700000-0000-4000-8000-000000000002', 'shipper', 'Tiendas Tau SA de CV', 'TTA070707GH7', 'approved'),
  ('c3700000-0000-4000-8000-000000000003', 'carrier', 'Fletes Siete SA de CV', 'FSI070707CD7', 'approved'),
  ('c3700000-0000-4000-8000-000000000004', 'carrier', 'Transportes Ajenos SA de CV', 'TAJ070707CD7', 'approved');
update public.profiles set company_id = 'c3700000-0000-4000-8000-000000000001'
where id = 'a3700000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c3700000-0000-4000-8000-000000000002'
where id = 'a3700000-0000-4000-8000-000000000002';
update public.profiles set company_id = 'c3700000-0000-4000-8000-000000000003'
where id in ('a3700000-0000-4000-8000-000000000003', 'a3700000-0000-4000-8000-000000000004',
             'a3700000-0000-4000-8000-000000000005', 'a3700000-0000-4000-8000-000000000006');
update public.profiles set company_id = 'c3700000-0000-4000-8000-000000000004'
where id = 'a3700000-0000-4000-8000-000000000007';

update public.business_units set name = 'Unidad A' where company_id = 'c3700000-0000-4000-8000-000000000003';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c3700000-0000-4000-8000-000000000003';
insert into public.business_units (id, company_id, name)
values ('b3700000-0000-4000-8000-00000000000b', 'c3700000-0000-4000-8000-000000000003', 'Unidad B');
insert into tests.vals values ('bu_b', 'b3700000-0000-4000-8000-00000000000b');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c3700000-0000-4000-8000-000000000003', 'a3700000-0000-4000-8000-000000000004'),
  (tests.val('bu_b'), 'c3700000-0000-4000-8000-000000000003', 'a3700000-0000-4000-8000-000000000005');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, phone) values
  ('d3700000-0000-4000-8000-00000000000a', 'c3700000-0000-4000-8000-000000000003', tests.val('bu_a'),
   'a3700000-0000-4000-8000-000000000006', 'Óscar Operador Secreto', '8112345678');
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e3700000-0000-4000-8000-00000000000a', 'c3700000-0000-4000-8000-000000000003', tests.val('bu_a'),
   'rigid', 'GGA3701', 'dry_van', 30000);
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where license_type is null;
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c3700000-0000-4000-8000-000000000003'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Load 1: S publishes, A offers with unit A, S accepts -> trip 1, A assigns O.
-- Load 2: S publishes and leaves it open. Load 3: T's draft.
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load1'));
insert into tests.vals select 'load2', public.create_load(tests.payload(2));
select public.publish_load(tests.val('load2'));
select tests.login('a3700000-0000-4000-8000-000000000002');
insert into tests.vals select 'load3', public.create_load(tests.payload(3));
select tests.login('a3700000-0000-4000-8000-000000000004');
insert into tests.vals
select 'offer1', public.make_offer(tests.val('load1'), 3000000, null, 'e3700000-0000-4000-8000-00000000000a');
select tests.login('a3700000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
select tests.login('a3700000-0000-4000-8000-000000000004');
select public.assign_trip(tests.val('trip1'), 'e3700000-0000-4000-8000-00000000000a', 'd3700000-0000-4000-8000-00000000000a');
reset role;

-- ---------------------------------------------------------------------------
-- Privileges: anon reaches only the two public RPCs; no direct writes
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname like '%share%'),
  array['public_shared_load', 'public_shared_trip'],
  'anon executes only the two public RPCs of the share links'
);
select ok(
  not has_function_privilege('anon', 'public.create_share_link(public.share_link_kind, uuid, uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_share_link(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.open_internal_share(text)', 'execute'),
  'anon cannot create, revoke or open an internal link'
);
select ok(
  not has_function_privilege('authenticated', 'public.share_link_by_token(text, public.share_link_kind)', 'execute')
  and not has_function_privilege('authenticated', 'public.share_link_record_view(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.share_link_public_load(public.loads)', 'execute'),
  'clients cannot call the internal helpers'
);
select ok(
  not has_table_privilege('anon', 'public.share_links', 'select, insert, update, delete')
  and not has_table_privilege('authenticated', 'public.share_links', 'insert, update, delete')
  and not has_column_privilege('authenticated', 'public.share_links', 'token_hash', 'select'),
  'share_links: anon reads nothing; clients never write and never read the token hash'
);
select is(
  (select array_agg(format('%s:%s/%s', b, (public.rate_limit_policy(b)).scope, (public.rate_limit_policy(b)).max_hits))
   from unnest(array['create_share_link']) b),
  array['create_share_link:rpc/30'],
  'creating links is rate limited per user (30 per minute)'
);

-- ---------------------------------------------------------------------------
-- create_share_link: arguments and defaults
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.create_share_link('load_public', tests.val('load2'), null, 0) $$,
  '22023', 'p_valid_for_hours must be between 1 and 720', 'validity below 1 hour is refused'
);
select throws_ok(
  $$ select * from public.create_share_link('load_public', tests.val('load2'), null, 721) $$,
  '22023', 'p_valid_for_hours must be between 1 and 720', 'validity above 30 days is refused'
);
select throws_ok(
  $$ select * from public.create_share_link('load_public', null, tests.val('trip1'), null) $$,
  '22023', 'a load link takes p_load_id only', 'a load link needs a load, not a trip'
);
select throws_ok(
  $$ select * from public.create_share_link('trip_tracking_public', tests.val('load1'), null, null) $$,
  '22023', 'a tracking link takes p_trip_id only', 'a tracking link needs a trip, not a load'
);
reset role;

select tests.share('pub2', 'a3700000-0000-4000-8000-000000000001', 'load_public', 'load2', null);
select tests.share('pub2_48h', 'a3700000-0000-4000-8000-000000000001', 'load_public', 'load2', null, 48);
select tests.share('trip1_pub', 'a3700000-0000-4000-8000-000000000001', 'trip_tracking_public', null, 'trip1');
select tests.share('int2_m', 'a3700000-0000-4000-8000-000000000003', 'load_internal', 'load2', null);
select tests.share('int1_a', 'a3700000-0000-4000-8000-000000000004', 'load_internal', 'load1', null);

select matches(tests.token('pub2'), '^[A-Za-z0-9_-]{43}$', 'the token is 32 random bytes in base64url (43 characters)');
select isnt(tests.token('pub2'), tests.token('pub2_48h'), 'every link gets its own token');
select is(
  (select token_hash from public.share_links where id = tests.val('pub2')),
  sha256(convert_to(tests.token('pub2'), 'UTF8')),
  'only the sha256 of the token is stored'
);
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'share_links' and column_name like '%token%'),
  1, 'share_links has no column for the token itself'
);
select ok(
  (select expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days'
   from public.share_links where id = tests.val('pub2')),
  'a public load link lasts 7 days by default'
);
select ok(
  (select expires_at between now() + interval '48 hours' - interval '1 minute' and now() + interval '48 hours'
   from public.share_links where id = tests.val('pub2_48h')),
  'the caller may choose the validity'
);
select ok(
  (select expires_at between now() + interval '30 days' - interval '1 minute' and now() + interval '30 days'
   from public.share_links where id = tests.val('trip1_pub')),
  'a tracking link lasts up to 30 days (and 24 h after the trip closes)'
);
select ok(
  (select expires_at between now() + interval '72 hours' - interval '1 minute' and now() + interval '72 hours'
   from public.share_links where id = tests.val('int2_m')),
  'an internal link lasts 72 hours by default'
);
select is(
  (select array[company_id, created_by] from public.share_links where id = tests.val('int1_a')),
  array['c3700000-0000-4000-8000-000000000003', 'a3700000-0000-4000-8000-000000000004']::uuid[],
  'a link belongs to the company of whoever created it'
);

-- ---------------------------------------------------------------------------
-- create_share_link: who creates each kind
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.create_share_link('load_public', tests.val('load2'), null, null) $$,
  '42501', 'load not found', 'another shipper cannot share a load that is not theirs'
);
select throws_ok(
  $$ select * from public.create_share_link('load_public', tests.val('load3'), null, null) $$,
  '22023', 'only a published load can be shared', 'a draft cannot be shared publicly'
);
select throws_ok(
  $$ select * from public.create_share_link('trip_tracking_public', null, tests.val('trip1'), null) $$,
  '42501', 'trip not found', 'another shipper cannot share the tracking of a trip that is not theirs'
);
select throws_ok(
  $$ select * from public.create_share_link('load_internal', tests.val('load2'), null, null) $$,
  '42501', 'load not found', 'a shipper cannot create an internal link'
);
select tests.login('a3700000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from public.create_share_link('load_public', tests.val('load2'), null, null) $$,
  '42501', 'load not found', 'the carrier cannot create a public load link'
);
select throws_ok(
  $$ select * from public.create_share_link('trip_tracking_public', null, tests.val('trip1'), null) $$,
  '42501', 'trip not found', 'the carrier cannot create a public tracking link'
);
select lives_ok(
  $$ select * from public.create_share_link('load_internal', tests.val('load1'), null, null) $$,
  'the manager shares a contracted load of the company internally'
);
select tests.login('a3700000-0000-4000-8000-000000000005');
select lives_ok(
  $$ select * from public.create_share_link('load_internal', tests.val('load2'), null, null) $$,
  'a coordinator shares a published load internally'
);
select throws_ok(
  $$ select * from public.create_share_link('load_internal', tests.val('load1'), null, null) $$,
  '42501', 'load not found', 'a coordinator of another business unit cannot share a load their unit does not carry'
);
select tests.login('a3700000-0000-4000-8000-000000000007');
select lives_ok(
  $$ select * from public.create_share_link('load_internal', tests.val('load2'), null, null) $$,
  'the manager of another approved carrier shares a published load with their own team'
);
select throws_ok(
  $$ select * from public.create_share_link('load_internal', tests.val('load1'), null, null) $$,
  '42501', 'load not found', 'but not a load contracted by someone else'
);
select tests.login('a3700000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select * from public.create_share_link('load_internal', tests.val('load2'), null, null) $$,
  '42501', 'load not found', 'an operator does not create links'
);
reset role;

-- ---------------------------------------------------------------------------
-- Read matrix of share_links: S, T, M, A, B, O, X, admin, anon
-- ---------------------------------------------------------------------------
create function tests.matrix(p_sql text)
returns text
language sql
as $$
  select string_agg(tests.sees(u.id, p_sql)::text, ',' order by u.ord)
  from (values (1, 'a3700000-0000-4000-8000-000000000001'::uuid), (2, 'a3700000-0000-4000-8000-000000000002'),
               (3, 'a3700000-0000-4000-8000-000000000003'), (4, 'a3700000-0000-4000-8000-000000000004'),
               (5, 'a3700000-0000-4000-8000-000000000005'), (6, 'a3700000-0000-4000-8000-000000000006'),
               (7, 'a3700000-0000-4000-8000-000000000007'), (8, 'a3700000-0000-4000-8000-000000000008'),
               (9, null)) as u(ord, id);
$$;

-- Links so far: S 3 (pub2, pub2_48h, trip1_pub); carrier 3: 4 (int2_m, int1_a, M's on load 1 and B's on
-- load 2); carrier 4: 1 (X's on load 2).
select is(
  tests.matrix($$ select 1 from public.share_links $$),
  '3,0,4,4,4,0,1,8,0',
  'share_links: each company''s staff reads its own links, admin all, operators and anon none'
);
select is(
  tests.matrix($$ select 1 from public.share_links where load_id = tests.val('load2') $$),
  '2,0,2,2,2,0,1,5,0',
  'the links of a load: the shipper sees only its own, each carrier only its own'
);

set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select token_hash from public.share_links $$, '42501', null,
  'the token hash is never readable by clients'
);
select throws_ok(
  $$ insert into public.share_links (kind, company_id, load_id, token_hash, expires_at)
     values ('load_public', 'c3700000-0000-4000-8000-000000000001', tests.val('load2'), sha256('x'::bytea), now() + interval '1 day') $$,
  '42501', null, 'clients do not insert links directly'
);
select throws_ok(
  $$ update public.share_links set expires_at = now() + interval '1 year' where id = tests.val('pub2') $$,
  '42501', null, 'clients do not update links directly (expiry only shrinks through revoke_share_link)'
);
select throws_ok(
  $$ delete from public.share_links where id = tests.val('pub2') $$,
  '42501', null, 'clients do not delete links'
);
reset role;

-- ---------------------------------------------------------------------------
-- open_internal_share: the company's staff and operators, with a session
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000005');
select is(
  (public.open_internal_share(tests.token('int2_m'))) -> 'canOffer', 'true'::jsonb,
  'a coordinator opens a link of the company and may offer on the published load'
);
select is(
  (public.open_internal_share(tests.token('int2_m'))) ->> 'loadId', tests.val('load2')::text,
  'the internal link resolves to its load'
);
select is(
  (public.open_internal_share(tests.token('int2_m'))) ->> 'proposedPriceCents', '3500000',
  'the internal link shows the proposed price (same company)'
);
select tests.login('a3700000-0000-4000-8000-000000000006');
select is(
  (public.open_internal_share(tests.token('int2_m'))) -> 'canOffer', 'false'::jsonb,
  'an operator of the company opens it read-only'
);
select is(
  (public.open_internal_share(tests.token('int1_a'))) -> 'canOffer', 'false'::jsonb,
  'a contracted load cannot be offered on'
);
select tests.login('a3700000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.open_internal_share(tests.token('int2_m')) $$,
  '42501', 'share link not found', 'another carrier cannot open an internal link, even with the token'
);
select tests.login('a3700000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.open_internal_share(tests.token('int2_m')) $$,
  '42501', 'share link not found', 'the shipper cannot open an internal link'
);
select throws_ok(
  $$ select public.open_internal_share(tests.token('pub2')) $$,
  '42501', 'share link not found', 'a public token does not open an internal view'
);
select tests.login('a3700000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.open_internal_share('nope') $$,
  '42501', 'share link not found', 'an unknown token gets the same error'
);
reset role;
select is(
  (select view_count from public.share_links where id = tests.val('int2_m')), 4,
  'every opening of an internal link is counted'
);

-- Load 4: X shares it with their team while it is published; once another
-- carrier contracts it, X's link stops opening.
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000001');
insert into tests.vals select 'load4', public.create_load(tests.payload(4));
select public.publish_load(tests.val('load4'));
reset role;
select tests.share('int4_x', 'a3700000-0000-4000-8000-000000000007', 'load_internal', 'load4', null);
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000007');
select is(
  (public.open_internal_share(tests.token('int4_x'))) ->> 'loadId', tests.val('load4')::text,
  'an internal link opens while the load is published'
);
select tests.login('a3700000-0000-4000-8000-000000000004');
insert into tests.vals
select 'offer4', public.make_offer(tests.val('load4'), 3000000, null, 'e3700000-0000-4000-8000-00000000000a');
select tests.login('a3700000-0000-4000-8000-000000000001');
select public.accept_offer(tests.val('offer4'));
select tests.login('a3700000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.open_internal_share(tests.token('int4_x')) $$,
  '42501', 'share link not found', 'an internal link stops opening once another carrier contracts the load'
);
reset role;

-- ---------------------------------------------------------------------------
-- public_shared_load (anon)
-- ---------------------------------------------------------------------------
set local role anon;
select tests.anon();
select set_eq(
  $$ select tests.json_keys(public.public_shared_load(tests.token('pub2'))) $$,
  array['kind', 'status', 'origin', 'origin.city', 'origin.state', 'destination', 'destination.city',
        'destination.state', 'pickupWindow', 'pickupWindow.start', 'pickupWindow.end',
        'deliveryWindow', 'deliveryWindow.start', 'deliveryWindow.end', 'cargoType', 'weightKg', 'unitType',
        'specialRequirements', 'expiresAt'],
  'public load: exactly the allowed keys (no price, addresses, description, notes or parties)'
);
select ok(
  public.public_shared_load(tests.token('pub2'))::text !~* '(3500000|Constitución|Vallarta|confidencial|1234 5678|Envíos Siete)',
  'public load: the price, the addresses, the description, the notes and the shipper never appear'
);
select is(
  public.public_shared_load(tests.token('pub2')) -> 'origin', '{"city": "Monterrey", "state": "Nuevo León"}'::jsonb,
  'public load: origin as city and state'
);
select throws_ok(
  $$ select public.public_shared_load(tests.token('trip1_pub')) $$,
  '42501', 'share link not found', 'a tracking token does not open a load'
);
select throws_ok(
  $$ select public.public_shared_load(tests.token('int2_m')) $$,
  '42501', 'share link not found', 'an internal token does not open a public view'
);
select throws_ok(
  $$ select public.public_shared_load('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  '42501', 'share link not found', 'an unknown token fails'
);
select throws_ok(
  $$ select public.public_shared_load(null) $$,
  '42501', 'share link not found', 'a null token fails the same way'
);
reset role;
select is(
  (select array[view_count::text, (last_viewed_at > now() - interval '1 minute')::text]
   from public.share_links where id = tests.val('pub2')),
  array['3', 'true'],
  'views are counted with their time'
);

-- Expired and revoked: the same error as an unknown token.
update public.share_links set created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
where id = tests.val('pub2_48h');
set local role anon;
select tests.anon();
select throws_ok(
  $$ select public.public_shared_load(tests.token('pub2_48h')) $$,
  '42501', 'share link not found', 'an expired token fails with the same error'
);
reset role;

set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.revoke_share_link(tests.val('pub2')) $$,
  '42501', 'share link not found', 'another company cannot revoke a link'
);
select tests.login('a3700000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.revoke_share_link(tests.val('pub2')) $$,
  '42501', 'share link not found', 'the carrier cannot revoke the shipper''s link'
);
select tests.login('a3700000-0000-4000-8000-000000000001');
select lives_ok($$ select public.revoke_share_link(tests.val('pub2')) $$, 'the shipper revokes its link');
select lives_ok($$ select public.revoke_share_link(tests.val('pub2')) $$, 'revoking twice is harmless');
select tests.login('a3700000-0000-4000-8000-000000000005');
select lives_ok($$ select public.revoke_share_link(tests.val('int2_m')) $$,
  'a coordinator revokes a link of the manager (same company)');
reset role;
select ok(
  (select revoked_at is not null from public.share_links where id = tests.val('pub2')),
  'revocation is recorded'
);
set local role anon;
select tests.anon();
select throws_ok(
  $$ select public.public_shared_load(tests.token('pub2')) $$,
  '42501', 'share link not found', 'a revoked token fails with the same error'
);
reset role;
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.open_internal_share(tests.token('int2_m')) $$,
  '42501', 'share link not found', 'a revoked internal link no longer opens'
);
reset role;

-- ---------------------------------------------------------------------------
-- public_shared_trip (anon): before departure, on the road, delivered, closed
-- ---------------------------------------------------------------------------
set local role anon;
select tests.anon();
select set_eq(
  $$ select tests.json_keys(public.public_shared_trip(tests.token('trip1_pub'))) $$,
  array['kind', 'status', 'origin', 'origin.city', 'origin.state', 'destination', 'destination.city',
        'destination.state', 'pickupWindow', 'pickupWindow.start', 'pickupWindow.end',
        'deliveryWindow', 'deliveryWindow.start', 'deliveryWindow.end', 'estimatedUnloadEndAt', 'carrierName',
        'unitType', 'plateMasked', 'timeline', 'lastPosition', 'expiresAt'],
  'public trip: exactly the allowed keys (no price, addresses, documents, chat or operator)'
);
select is(
  public.public_shared_trip(tests.token('trip1_pub')) -> 'lastPosition', 'null'::jsonb,
  'before departure there is no position'
);
select is(
  public.public_shared_trip(tests.token('trip1_pub')) ->> 'plateMasked', '***701',
  'the plate shows only its last 3 characters'
);
select is(
  public.public_shared_trip(tests.token('trip1_pub')) ->> 'carrierName', 'Fletes Siete SA de CV',
  'the carrier''s legal name is shown'
);
select ok(
  public.public_shared_trip(tests.token('trip1_pub'))::text !~* '(3000000|3500000|Óscar|Secreto|8112345678|Constitución|Vallarta|Envíos Siete|GGA3701)',
  'public trip: the prices, the operator, the addresses, the shipper and the full plate never appear'
);
select is(
  (select jsonb_agg(e ->> 'type') from jsonb_array_elements(public.public_shared_trip(tests.token('trip1_pub')) -> 'timeline') e),
  '["created", "assigned"]'::jsonb,
  'the timeline lists the event types'
);
select is(
  (select bool_and(e ?| array['notes', 'receivedByName', 'actorId', 'actorRole', 'latitude', 'longitude'])
   from jsonb_array_elements(public.public_shared_trip(tests.token('trip1_pub')) -> 'timeline') e),
  false, 'timeline events carry neither notes nor who recorded them'
);
reset role;

-- The unit leaves and sends GPS points (as the owner: the fixture of B22).
update public.trips set status = 'in_transit', started_at = now() - interval '2 hours' where id = tests.val('trip1');
insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, latitude, longitude, notes,
                                actor_id, actor_role)
values (tests.val('trip1'), 'departed', 'assigned', 'en_route_to_pickup', now() - interval '2 hours', 25.7, -100.3,
        'Nota privada del operador', 'a3700000-0000-4000-8000-000000000006', 'operator');
insert into public.trip_locations (trip_id, recorded_at, latitude, longitude)
values (tests.val('trip1'), now() - interval '90 minutes', 25.5, -100.9),
       (tests.val('trip1'), now() - interval '30 minutes', 24.1, -101.2);

set local role anon;
select tests.anon();
select is(
  (public.public_shared_trip(tests.token('trip1_pub')) -> 'lastPosition') - 'recordedAt'::text,
  '{"lat": 24.1, "lng": -101.2}'::jsonb,
  'on the road, the last position is shared'
);
select ok(
  public.public_shared_trip(tests.token('trip1_pub'))::text !~ 'Nota privada',
  'the notes of the events stay private'
);
reset role;

update public.trips set status = 'delivered', delivered_at = now() where id = tests.val('trip1');
set local role anon;
select tests.anon();
select is(
  public.public_shared_trip(tests.token('trip1_pub')) -> 'lastPosition', 'null'::jsonb,
  'once delivered, the position is no longer shared'
);
select is(
  public.public_shared_trip(tests.token('trip1_pub')) ->> 'status', 'delivered',
  'the status keeps updating'
);
reset role;

update public.trips set status = 'closed', closed_at = now() - interval '23 hours' where id = tests.val('trip1');
set local role anon;
select tests.anon();
select lives_ok(
  $$ select public.public_shared_trip(tests.token('trip1_pub')) $$,
  'the tracking link still works 23 hours after the trip closed'
);
reset role;
update public.trips set closed_at = now() - interval '25 hours' where id = tests.val('trip1');
set local role anon;
select tests.anon();
select throws_ok(
  $$ select public.public_shared_trip(tests.token('trip1_pub')) $$,
  '42501', 'share link not found', 'and stops 24 hours after the trip closed'
);
select throws_ok(
  $$ select public.public_shared_trip(tests.token('pub2')) $$,
  '42501', 'share link not found', 'a load token does not open a tracking'
);
reset role;

-- Nor can a new link be created then: it would never open.
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.create_share_link('trip_tracking_public', null, tests.val('trip1'), null) $$,
  '22023', 'the tracking of this trip has ended',
  'no tracking link is created more than 24 hours after the trip closed'
);
reset role;

-- A cancelled trip cannot be shared.
update public.trips set status = 'cancelled', cancelled_at = now(), closed_at = null,
  cancellation_reason_code = 'shipper_request', cancelled_by_side = 'shipper' where id = tests.val('trip1');
set local role authenticated;
select tests.login('a3700000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.create_share_link('trip_tracking_public', null, tests.val('trip1'), null) $$,
  '22023', 'a cancelled trip cannot be shared', 'a cancelled trip cannot be shared'
);
reset role;

-- An archived load disappears behind its link.
update public.loads set archived_at = now() where id = tests.val('load2');
set local role anon;
select tests.anon();
select throws_ok(
  $$ select public.public_shared_load(tests.token('pub2_48h')) $$,
  '42501', 'share link not found', 'an archived load is not served'
);
reset role;

-- Cascade: deleting the load deletes its links (as the owner).
delete from public.share_links where load_id = tests.val('load2');
select is(
  (select count(*)::int from public.share_links where load_id = tests.val('load2')), 0,
  'the links of a load go with it'
);

select * from finish();
rollback;
