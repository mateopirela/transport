-- I1 (corrections) · Cargo insurance notices and accepted terms:
--   * an offer accepted less than 24 hours before the pickup tells the
--     shipper once: the reminder of remind_cargo_insurance does not repeat
--     the notice of the acceptance (the carrier staff is still warned);
--   * accept_terms and the sign-up only keep the current version of the
--     terms (current_terms_version, mirrored by TERMS_VERSION in
--     packages/shared/src/copy/legal.ts): no impossible, old or future
--     versions;
--   * add_trip_document checks the side of the caller before its
--     idempotency, and only returns a document the caller uploaded: the
--     carrier never learns the id of the shipper's policy.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text, p_terms text default null)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i1fix.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_strip_nulls(jsonb_build_object('role', p_role, 'phone', '+525500000000', 'terms_version', p_terms)),
          now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

-- A MTY -> GDL load whose pickup opens in p_hours (4 h window).
create function tests.payload(p_hours integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + make_interval(hours => p_hours),
                                       'end', now() + make_interval(hours => p_hours + 4)),
    'deliveryWindow', jsonb_build_object('start', now() + make_interval(hours => p_hours + 24),
                                         'end', now() + make_interval(hours => p_hours + 30)),
    'cargoType', 'palletized',
    'description', 'Tarimas',
    'weightKg', 9000,
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

-- The shipper S publishes a load (pickup in p_hours), the manager M offers
-- with p_vehicle and S accepts; the manager assigns p_vehicle and O.
create function tests.contract(p_name text, p_hours integer, p_vehicle uuid)
returns uuid
language plpgsql
as $$
declare
  v_load uuid;
  v_offer uuid;
  v_trip uuid;
begin
  perform tests.login('a6300000-0000-4000-8000-000000000001');
  v_load := public.create_load(tests.payload(p_hours));
  perform public.publish_load(v_load);
  perform tests.login('a6300000-0000-4000-8000-000000000002');
  v_offer := public.make_offer(v_load, 3000000, null, p_vehicle);
  perform tests.login('a6300000-0000-4000-8000-000000000001');
  v_trip := public.accept_offer(v_offer);
  perform tests.login('a6300000-0000-4000-8000-000000000002');
  perform public.assign_trip(v_trip, p_vehicle, 'd6300000-0000-4000-8000-000000000004');
  insert into tests.vals values (p_name, v_trip);
  return v_trip;
end;
$$;

-- Puts a file in the trip-documents bucket as the current user.
create function tests.upload(p_trip uuid, p_file uuid)
returns text
language plpgsql
as $$
declare
  v_path text := p_trip || '/' || p_file || '.pdf';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('trip-documents', v_path, (select auth.uid())::text, '{"mimetype":"application/pdf","size":2048}'::jsonb);
  return v_path;
end;
$$;

-- cargo_insurance_missing notifications of a user about a trip, by audience.
create function tests.notices(p_user uuid, p_trip uuid, p_audience text)
returns integer
language sql
as $$
  select count(*)::int from public.notifications n
  where n.user_id = p_user and n.type = 'cargo_insurance_missing'
    and n.data ->> 'tripId' = p_trip::text and n.data ->> 'audience' = p_audience;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a63…: 01 shipper S, 02 manager M, 03 coordinator K (of the trip's
-- business unit), 04 operator O, 05 a shipper who signs up with an old
-- version, 06 one with a future version, 07 one with an impossible date.
select tests.new_user('a6300000-0000-4000-8000-000000000001', 'shipper', '2026-11-10');
select tests.new_user('a6300000-0000-4000-8000-000000000002', 'manager', '2026-11-10');
select tests.new_user('a6300000-0000-4000-8000-000000000003', 'coordinator', '2026-11-10');
select tests.new_user('a6300000-0000-4000-8000-000000000004', 'operator', '2026-11-10');
select tests.new_user('a6300000-0000-4000-8000-000000000005', 'shipper', '2020-01-01');
select tests.new_user('a6300000-0000-4000-8000-000000000006', 'shipper', '2099-12-31');
select tests.new_user('a6300000-0000-4000-8000-000000000007', 'shipper', '2026-13-45');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c6300000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sesenta y Tres SA de CV', 'EST050505GH5', 'approved'),
  ('c6300000-0000-4000-8000-000000000002', 'carrier', 'Fletes Sesenta y Tres SA de CV', 'FST040404CD4', 'approved');
update public.profiles set company_id = 'c6300000-0000-4000-8000-000000000001'
where id = 'a6300000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c6300000-0000-4000-8000-000000000002'
where id in ('a6300000-0000-4000-8000-000000000002', 'a6300000-0000-4000-8000-000000000003',
             'a6300000-0000-4000-8000-000000000004');

insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
select b.id, b.company_id, 'a6300000-0000-4000-8000-000000000003'
from public.business_units b where b.company_id = 'c6300000-0000-4000-8000-000000000002';

insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
  ('d6300000-0000-4000-8000-000000000004', 'c6300000-0000-4000-8000-000000000002',
   'a6300000-0000-4000-8000-000000000004', 'Óscar Operador', 'E', current_date + 365);
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg)
select ('e6300000-0000-4000-8000-00000000000' || n)::uuid, 'c6300000-0000-4000-8000-000000000002', 'rigid',
       'GGI630' || n, 'dry_van', 12000
from generate_series(1, 3) n;
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c6300000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- 1. An offer accepted less than 24 hours before the pickup: one notice
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.contract('soon', 12, 'e6300000-0000-4000-8000-000000000001');
select tests.contract('far', 72, 'e6300000-0000-4000-8000-000000000002');
reset role;
select is(tests.notices('a6300000-0000-4000-8000-000000000001', tests.val('soon'), 'shipper'), 1,
  'the shipper is told at acceptance');

-- pg_cron runs it without a user (notify_carrier_staff skips the caller).
select set_config('request.jwt.claims', '', true);
select public.remind_cargo_insurance();
select is(tests.notices('a6300000-0000-4000-8000-000000000001', tests.val('soon'), 'shipper'), 1,
  'an offer accepted within 24 hours of the pickup is not repeated by the reminder');
select is(tests.notices('a6300000-0000-4000-8000-000000000002', tests.val('soon'), 'carrier'), 1,
  'the manager is still warned by the reminder');
select is(tests.notices('a6300000-0000-4000-8000-000000000003', tests.val('soon'), 'carrier'), 1,
  'and the coordinator of the trip''s business unit');
select is((select count(*)::int from public.cargo_insurance_reminders where trip_id = tests.val('soon')), 1,
  'the trip counts as reminded');

-- The trip accepted three days ahead: once its pickup is within 24 hours,
-- the shipper is reminded (the notice of the acceptance is old news).
update public.loads
set pickup_window_start = now() + interval '10 hours', pickup_window_end = now() + interval '14 hours'
where id = (select load_id from public.trips where id = tests.val('far'));
update public.notifications set created_at = now() - interval '2 days'
where type = 'cargo_insurance_missing' and data ->> 'tripId' = tests.val('far')::text;
select public.remind_cargo_insurance();
select is(tests.notices('a6300000-0000-4000-8000-000000000001', tests.val('far'), 'shipper'), 2,
  'an offer accepted days before the pickup is reminded 24 hours before');
select is(tests.notices('a6300000-0000-4000-8000-000000000002', tests.val('far'), 'carrier'), 1,
  'together with the carrier staff');

-- ---------------------------------------------------------------------------
-- 2. Only the current version of the terms is kept
-- ---------------------------------------------------------------------------
select is(public.current_terms_version(), '2026-11-10',
  'the current version of the terms (TERMS_VERSION in packages/shared/src/copy/legal.ts)');
select is(
  (select count(*)::int from public.terms_acceptances
   where user_id in ('a6300000-0000-4000-8000-000000000005', 'a6300000-0000-4000-8000-000000000006',
                     'a6300000-0000-4000-8000-000000000007')),
  0, 'the sign-up keeps no old, future or impossible version'
);
set local role authenticated;
select tests.login('a6300000-0000-4000-8000-000000000005');
select throws_ok($$ select public.accept_terms('2026-13-45') $$, '22023', 'invalid terms version',
  'an impossible date is refused');
select throws_ok($$ select public.accept_terms('2099-12-31') $$, '22023', 'invalid terms version',
  'a future version cannot be accepted in advance');
select throws_ok($$ select public.accept_terms('2020-01-01') $$, '22023', 'invalid terms version',
  'nor an old one');
select isnt(public.accept_terms(public.current_terms_version()), null, 'the current version is accepted');
select is(
  (select array_agg(terms_version) from public.terms_acceptances
   where user_id = 'a6300000-0000-4000-8000-000000000005'),
  array['2026-11-10'], 'and it is the only one kept'
);

-- ---------------------------------------------------------------------------
-- 3. add_trip_document: the side first, then the idempotency
-- ---------------------------------------------------------------------------
select tests.login('a6300000-0000-4000-8000-000000000001');
insert into tests.vals
select 'policy', public.add_trip_document(
  tests.val('far'), 'cargo_insurance',
  tests.upload(tests.val('far'), 'f6300000-0000-4000-8000-000000000001'), 'poliza.pdf');
select tests.login('a6300000-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.add_trip_document(%L, 'cargo_insurance', %L, 'x.pdf') $$,
         tests.val('far'), tests.val('far') || '/f6300000-0000-4000-8000-000000000001.pdf'),
  '42501', 'the carrier side does not upload cargo_insurance documents',
  'the carrier resending the path of the shipper''s policy is refused by its side'
);
select throws_ok(
  format($$ select public.add_trip_document(%L, 'carta_porte', %L, 'x.pdf') $$,
         tests.val('far'), tests.val('far') || '/f6300000-0000-4000-8000-000000000001.pdf'),
  '22023', 'file was not uploaded',
  'and under a kind it uploads it does not get the id of the policy'
);
select tests.login('a6300000-0000-4000-8000-000000000001');
select is(
  public.add_trip_document(tests.val('far'), 'cargo_insurance',
                           tests.val('far') || '/f6300000-0000-4000-8000-000000000001.pdf', 'poliza.pdf'),
  tests.val('policy'), 'the uploader retrying gets the same document'
);
reset role;

select * from finish();
rollback;
