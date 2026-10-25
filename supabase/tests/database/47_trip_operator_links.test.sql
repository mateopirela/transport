-- H2 · Trip link for the operator (D29): who issues it (the manager and the
-- coordinator of the trip's business unit; not the coordinator of another
-- unit, the operator, the shipper or another company), the token (entropy,
-- only its hash stored, 30 days), where it takes each caller
-- (open_trip_operator_link: the assigned operator to their trip, the unit's
-- staff to the detail, everyone else the same error with no ids), one live
-- link per trip (issuing again revokes the previous), and the automatic end:
-- reassigning, cancelling or closing the trip revokes it, and an expired or
-- revoked link fails like an unknown one.
begin;
create extension if not exists pgtap with schema extensions;

select plan(51);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@h2.test', now(),
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
    'description', 'Tarimas de acero',
    'weightKg', 18000,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(),
    'proposedPriceCents', 3500000
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

-- Issues the operator link of p_trip as p_uid and keeps its id and token under p_name.
create function tests.issue(p_name text, p_uid uuid, p_trip text)
returns void
language plpgsql
as $$
declare
  r record;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  select * into r from public.create_trip_operator_link(tests.val(p_trip));
  execute 'reset role';
  insert into tests.vals values (p_name, r.id);
  insert into tests.tokens values (p_name, r.token);
end;
$$;

-- What open_trip_operator_link answers p_uid for a token: the target, or the
-- SQLSTATE and message of the error.
create function tests.open_as(p_uid uuid, p_token text)
returns text
language plpgsql
as $$
declare
  v_doc jsonb;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  begin
    v_doc := public.open_trip_operator_link(p_token);
  exception when others then
    execute 'reset role';
    return sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  return v_doc ->> 'target';
end;
$$;

-- The whole answer of open_trip_operator_link for p_uid.
create function tests.open_doc(p_uid uuid, p_token text)
returns jsonb
language plpgsql
as $$
declare
  v_doc jsonb;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  v_doc := public.open_trip_operator_link(p_token);
  execute 'reset role';
  return v_doc;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a47…: 01 S shipper, 03 M manager, 04 A coordinator (unit A),
-- 05 B coordinator (unit B), 06 O operator (unit A), 09 P another operator
-- (unit A), 07 X manager of another approved carrier, 08 admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a4700000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a4700000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a4700000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a4700000-0000-4000-8000-000000000005', 'coordinator');
select tests.new_user('a4700000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a4700000-0000-4000-8000-000000000009', 'operator');
select tests.new_user('a4700000-0000-4000-8000-000000000007', 'manager');
select tests.new_user('a4700000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin' where id = 'a4700000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c4700000-0000-4000-8000-000000000001', 'shipper', 'Envíos Cuarenta SA de CV', 'ECU070707GH7', 'approved'),
  ('c4700000-0000-4000-8000-000000000003', 'carrier', 'Fletes Cuarenta SA de CV', 'FCU070707CD7', 'approved'),
  ('c4700000-0000-4000-8000-000000000004', 'carrier', 'Transportes Otros SA de CV', 'TOT070707CD7', 'approved');
update public.profiles set company_id = 'c4700000-0000-4000-8000-000000000001'
where id = 'a4700000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c4700000-0000-4000-8000-000000000003'
where id in ('a4700000-0000-4000-8000-000000000003', 'a4700000-0000-4000-8000-000000000004',
             'a4700000-0000-4000-8000-000000000005', 'a4700000-0000-4000-8000-000000000006',
             'a4700000-0000-4000-8000-000000000009');
update public.profiles set company_id = 'c4700000-0000-4000-8000-000000000004'
where id = 'a4700000-0000-4000-8000-000000000007';

insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c4700000-0000-4000-8000-000000000003';
insert into public.business_units (id, company_id, name)
values ('b4700000-0000-4000-8000-00000000000b', 'c4700000-0000-4000-8000-000000000003', 'Unidad B');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c4700000-0000-4000-8000-000000000003', 'a4700000-0000-4000-8000-000000000004'),
  ('b4700000-0000-4000-8000-00000000000b', 'c4700000-0000-4000-8000-000000000003', 'a4700000-0000-4000-8000-000000000005');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, phone) values
  ('d4700000-0000-4000-8000-00000000000a', 'c4700000-0000-4000-8000-000000000003', tests.val('bu_a'),
   'a4700000-0000-4000-8000-000000000006', 'Óscar Operador', '8112345678'),
  ('d4700000-0000-4000-8000-00000000000b', 'c4700000-0000-4000-8000-000000000003', tests.val('bu_a'),
   'a4700000-0000-4000-8000-000000000009', 'Pablo Operador', '8187654321');
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e4700000-0000-4000-8000-00000000000a', 'c4700000-0000-4000-8000-000000000003', tests.val('bu_a'),
   'rigid', 'GGA4701', 'dry_van', 30000),
  ('e4700000-0000-4000-8000-00000000000b', 'c4700000-0000-4000-8000-000000000003', tests.val('bu_a'),
   'rigid', 'GGA4702', 'dry_van', 30000),
  ('e4700000-0000-4000-8000-00000000000c', 'c4700000-0000-4000-8000-000000000003', tests.val('bu_a'),
   'rigid', 'GGA4703', 'dry_van', 30000);
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where company_id = 'c4700000-0000-4000-8000-000000000003';
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c4700000-0000-4000-8000-000000000003'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Three loads of S, each won by A with its own unit: trip1 and trip2 assigned
-- to O; trip3 left without an operator (pending_assignment).
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load1'));
insert into tests.vals select 'load2', public.create_load(tests.payload(2));
select public.publish_load(tests.val('load2'));
insert into tests.vals select 'load3', public.create_load(tests.payload(3));
select public.publish_load(tests.val('load3'));
select tests.login('a4700000-0000-4000-8000-000000000004');
insert into tests.vals
select 'offer1', public.make_offer(tests.val('load1'), 3000000, null, 'e4700000-0000-4000-8000-00000000000a');
insert into tests.vals
select 'offer2', public.make_offer(tests.val('load2'), 3000000, null, 'e4700000-0000-4000-8000-00000000000b');
insert into tests.vals
select 'offer3', public.make_offer(tests.val('load3'), 3000000, null, 'e4700000-0000-4000-8000-00000000000c');
select tests.login('a4700000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
insert into tests.vals select 'trip2', public.accept_offer(tests.val('offer2'));
insert into tests.vals select 'trip3', public.accept_offer(tests.val('offer3'));
select tests.login('a4700000-0000-4000-8000-000000000004');
select public.assign_trip(tests.val('trip1'), 'e4700000-0000-4000-8000-00000000000a', 'd4700000-0000-4000-8000-00000000000a');
select public.assign_trip(tests.val('trip2'), 'e4700000-0000-4000-8000-00000000000b', 'd4700000-0000-4000-8000-00000000000a');
reset role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.create_trip_operator_link(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.open_trip_operator_link(text)', 'execute'),
  'anon cannot issue or open a trip link'
);
select ok(
  has_function_privilege('authenticated', 'public.create_trip_operator_link(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.open_trip_operator_link(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.trip_operator_link_issuable(public.trip_status)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_trip_operator_link()', 'execute'),
  'signed-in users call the two RPCs, never the helpers'
);
select is(
  (select array_agg(format('%s:%s/%s', b, (public.rate_limit_policy(b)).scope, (public.rate_limit_policy(b)).max_hits))
   from unnest(array['create_share_link', 'open_trip_operator_link']) b),
  array['create_share_link:rpc/30', 'open_trip_operator_link:rpc/30'],
  'issuing and opening trip links are rate limited per user (30 per minute)'
);
select ok(
  not has_column_privilege('authenticated', 'public.share_links', 'token_hash', 'select')
  and has_column_privilege('authenticated', 'public.share_links', 'operator_id', 'select'),
  'the staff reads the operator of a link, never the token hash'
);

-- ---------------------------------------------------------------------------
-- Who issues the link
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip1')) $$,
  '42501', 'trip not found', 'a coordinator of another business unit cannot issue it'
);
select tests.login('a4700000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip1')) $$,
  '42501', 'trip not found', 'the operator cannot issue it'
);
select tests.login('a4700000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip1')) $$,
  '42501', 'trip not found', 'the shipper cannot issue it'
);
select tests.login('a4700000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip1')) $$,
  '42501', 'trip not found', 'another carrier cannot issue it'
);
select tests.login('a4700000-0000-4000-8000-000000000008');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip1')) $$,
  '42501', 'trip not found', 'the admin does not issue it either'
);
select tests.login('a4700000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip3')) $$,
  '55000', 'the trip has no operator on it', 'a trip without an operator has no link'
);
select throws_ok(
  $$ select * from public.create_trip_operator_link('f4700000-0000-4000-8000-000000000000') $$,
  '42501', 'trip not found', 'an unknown trip is not found'
);
reset role;

select tests.issue('m1', 'a4700000-0000-4000-8000-000000000003', 'trip1');
select matches(tests.token('m1'), '^[A-Za-z0-9_-]{43}$', 'the token is 32 random bytes in base64url (43 characters)');
select is(
  (select token_hash from public.share_links where id = tests.val('m1')),
  sha256(convert_to(tests.token('m1'), 'UTF8')),
  'only the sha256 of the token is stored'
);
select is(
  (select array[company_id, trip_id, operator_id, created_by]
   from public.share_links where id = tests.val('m1')),
  array['c4700000-0000-4000-8000-000000000003', tests.val('trip1'),
        'd4700000-0000-4000-8000-00000000000a', 'a4700000-0000-4000-8000-000000000003']::uuid[],
  'the link belongs to the carrier and names the trip and its operator'
);
select ok(
  (select kind = 'trip_operator' and load_id is null
          and expires_at between now() + interval '30 days' - interval '1 minute' and now() + interval '30 days'
   from public.share_links where id = tests.val('m1')),
  'the manager issues a trip_operator link that lasts 30 days'
);

select tests.issue('a1', 'a4700000-0000-4000-8000-000000000004', 'trip1');
select isnt(tests.token('a1'), tests.token('m1'), 'every link gets its own token');
select ok(
  (select revoked_at is not null from public.share_links where id = tests.val('m1')),
  'issuing it again (the coordinator of the unit) revokes the previous link'
);
select is(
  (select count(*)::int from public.share_links
   where trip_id = tests.val('trip1') and kind = 'trip_operator' and revoked_at is null),
  1, 'one live operator link per trip'
);
select throws_ok(
  format($$ insert into public.share_links (kind, company_id, trip_id, operator_id, token_hash, expires_at)
            values ('trip_operator', 'c4700000-0000-4000-8000-000000000003', %L,
                    'd4700000-0000-4000-8000-00000000000a', sha256('x'::bytea), now() + interval '1 day') $$,
         tests.val('trip1')),
  '23505', null, 'the database refuses a second live link for the same trip'
);
select throws_ok(
  format($$ insert into public.share_links (kind, company_id, trip_id, token_hash, expires_at)
            values ('trip_operator', 'c4700000-0000-4000-8000-000000000003', %L,
                    sha256('y'::bytea), now() + interval '1 day') $$,
         tests.val('trip2')),
  '23514', null, 'a trip_operator link always names its operator'
);
select throws_ok(
  format($$ insert into public.share_links (kind, company_id, trip_id, operator_id, token_hash, expires_at)
            values ('trip_tracking_public', 'c4700000-0000-4000-8000-000000000001', %L,
                    'd4700000-0000-4000-8000-00000000000a', sha256('z'::bytea), now() + interval '1 day') $$,
         tests.val('trip2')),
  '23514', null, 'the other kinds never carry an operator'
);

-- ---------------------------------------------------------------------------
-- Where the link takes each caller
-- ---------------------------------------------------------------------------
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', tests.token('a1')), 'operator',
          'the assigned operator opens their trip');
select is(
  tests.open_doc('a4700000-0000-4000-8000-000000000006', tests.token('a1')),
  jsonb_build_object('tripId', tests.val('trip1'), 'target', 'operator'),
  'the answer is the trip and the target, nothing else'
);
select is(tests.open_as('a4700000-0000-4000-8000-000000000004', tests.token('a1')), 'carrier',
          'the coordinator of the unit goes to the trip detail');
select is(tests.open_as('a4700000-0000-4000-8000-000000000003', tests.token('a1')), 'carrier',
          'the manager goes to the trip detail');
select is(tests.open_as('a4700000-0000-4000-8000-000000000005', tests.token('a1')),
          '22023 invalid or expired link', 'a coordinator of another unit gets the same error');
select is(tests.open_as('a4700000-0000-4000-8000-000000000009', tests.token('a1')),
          '22023 invalid or expired link', 'another operator of the company gets the same error');
select is(tests.open_as('a4700000-0000-4000-8000-000000000007', tests.token('a1')),
          '22023 invalid or expired link', 'another carrier gets the same error');
select is(tests.open_as('a4700000-0000-4000-8000-000000000001', tests.token('a1')),
          '22023 invalid or expired link', 'the shipper of the trip gets the same error');
select is(tests.open_as('a4700000-0000-4000-8000-000000000008', tests.token('a1')),
          '22023 invalid or expired link', 'the admin gets the same error');
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', tests.token('m1')),
          '22023 invalid or expired link', 'the revoked previous link no longer opens');
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', repeat('A', 43)),
          '22023 invalid or expired link', 'an unknown token gets the same error');
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', 'not a token'),
          '22023 invalid or expired link', 'a malformed token gets the same error');
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', null),
          '22023 invalid or expired link', 'no token gets the same error');

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  format($$ select public.open_trip_operator_link(%L) $$, tests.token('a1')),
  '42501', null, 'anon cannot open it'
);
reset role;

select ok(
  (select view_count = 4 and last_viewed_at is not null from public.share_links where id = tests.val('a1')),
  'each successful open counts a view (the failed ones do not)'
);

-- ---------------------------------------------------------------------------
-- Revocation by hand
-- ---------------------------------------------------------------------------
select tests.issue('a2', 'a4700000-0000-4000-8000-000000000004', 'trip2');
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000005');
select throws_ok(
  format($$ select public.revoke_share_link(%L) $$, tests.val('a2')),
  '42501', 'share link not found', 'a coordinator of another unit cannot revoke it'
);
select tests.login('a4700000-0000-4000-8000-000000000006');
select throws_ok(
  format($$ select public.revoke_share_link(%L) $$, tests.val('a2')),
  '42501', 'share link not found', 'the operator cannot revoke it'
);
select tests.login('a4700000-0000-4000-8000-000000000004');
select lives_ok(
  format($$ select public.revoke_share_link(%L) $$, tests.val('a2')),
  'the coordinator of the unit revokes it'
);
reset role;
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', tests.token('a2')),
          '22023 invalid or expired link', 'a revoked link no longer opens');

-- ---------------------------------------------------------------------------
-- The link ends with the operator or the trip
-- ---------------------------------------------------------------------------
-- Reassigning trip1 to P revokes O's link.
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000004');
select public.assign_trip(tests.val('trip1'), 'e4700000-0000-4000-8000-00000000000a', 'd4700000-0000-4000-8000-00000000000b');
reset role;
select ok(
  (select revoked_at is not null from public.share_links where id = tests.val('a1')),
  'reassigning the trip to another operator revokes the link'
);
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', tests.token('a1')),
          '22023 invalid or expired link', 'the previous operator can no longer open it');

-- Assigning again with the same operator (another unit) keeps the link.
select tests.issue('p1', 'a4700000-0000-4000-8000-000000000004', 'trip1');
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000004');
select public.assign_trip(tests.val('trip1'), 'e4700000-0000-4000-8000-00000000000c', 'd4700000-0000-4000-8000-00000000000b');
reset role;
select is(tests.open_as('a4700000-0000-4000-8000-000000000009', tests.token('p1')), 'operator',
          'changing only the unit keeps the operator''s link');

-- A link that expired fails like an unknown one.
update public.share_links set created_at = now() - interval '31 days', expires_at = now() - interval '1 second'
where id = tests.val('p1');
select is(tests.open_as('a4700000-0000-4000-8000-000000000009', tests.token('p1')),
          '22023 invalid or expired link', 'an expired link no longer opens');

-- Cancelling trip1 revokes its live link and no new one can be issued.
select tests.issue('p2', 'a4700000-0000-4000-8000-000000000003', 'trip1');
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000004');
select public.cancel_trip(tests.val('trip1'), 'carrier_request', 'La unidad no salió');
reset role;
select ok(
  (select revoked_at is not null from public.share_links where id = tests.val('p2')),
  'cancelling the trip revokes the link'
);
select is(tests.open_as('a4700000-0000-4000-8000-000000000009', tests.token('p2')),
          '22023 invalid or expired link', 'a cancelled trip opens nothing');
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip1')) $$,
  '55000', 'the trip has no operator on it', 'a cancelled trip gets no new link'
);
reset role;

-- Closing trip2 revokes its live link.
select tests.issue('a3', 'a4700000-0000-4000-8000-000000000004', 'trip2');
update public.trips set status = 'delivered' where id = tests.val('trip2');
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', tests.token('a3')), 'operator',
          'a delivered trip still opens for its operator (they close it)');
set local role authenticated;
select tests.login('a4700000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.create_trip_operator_link(tests.val('trip2')) $$,
  '55000', 'the trip has no operator on it', 'once delivered no new link is issued'
);
reset role;
update public.trips set status = 'closed', closed_at = now() where id = tests.val('trip2');
select ok(
  (select revoked_at is not null from public.share_links where id = tests.val('a3')),
  'closing the trip revokes the link'
);
select is(tests.open_as('a4700000-0000-4000-8000-000000000006', tests.token('a3')),
          '22023 invalid or expired link', 'a closed trip opens nothing');

select * from finish();
rollback;
