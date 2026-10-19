-- B10 · Demo data for the Monterrey <-> Guadalajara pilot (LOCAL ONLY).
--
-- Loaded by `supabase db reset` / `supabase start` ([db.seed] in config.toml).
-- Never run it against a cloud project: every demo user shares the password
-- documented in docs/demo-local.md.
--
-- What it creates (docs/plan-v1.md, B10):
--   * 1 admin, 3 shipper companies and 3 carrier companies (the third one is a
--     "hombre-camión": a persona física that is also its own operator, D13).
--   * 8 units of several kinds and types, and 7 operators (5 with an account,
--     one of them a phone-only operator provisioned by an invitation link, G2).
--   * Business units (G1a.2): Transportes Regios del Norte has two, each with
--     its coordinator; the other carriers have their "Principal" one.
--   * 15 loads in both directions and in every status, with their
--     negotiations, offers, trips, timelines, GPS points and chat messages.
--   * Trip MTY -> GDL unloading with an estimated end, so its unit is
--     available in Guadalajara and the GDL -> MTY load is its return trip (B08).
--
-- Rows are inserted directly as the database owner (RLS does not apply), with
-- timestamps relative to the hour of the reset so the demo always looks
-- current. Every table constraint and trigger still applies, and each row
-- mirrors what the RPCs of B01-B07 would have written. Fixed ids start with
-- 5eed so they are easy to recognize: 5eed00TT-0000-4000-8000-0000000000NN,
-- where TT is 01 users, 02 companies, 03 operators, 04 vehicles, 05 loads,
-- 06 negotiations, 07 offers and 08 trips.

-- Guard: demo data only goes into a fresh database. A database that already
-- has users (staging, production, or a local one in use) is left untouched.
do $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'seed.sql only runs on an empty database (auth.users is not empty)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers (session-local, dropped with the connection)
-- ---------------------------------------------------------------------------

-- Every timestamp is the hour of the reset plus an offset.
create temporary table seed_clock as select date_trunc('hour', now()) as base;

create function pg_temp.at(p_offset interval)
returns timestamptz
language sql
stable
as $$
  select base + p_offset from seed_clock;
$$;

-- An email/password user, already confirmed. The sign-up trigger
-- (handle_new_user) creates its profile from the metadata; the phone is
-- stored in E.164 (G2). An operator account carries the app metadata the
-- Edge Function redeem-invitation writes (handle_new_user requires it).
create function pg_temp.seed_user(
  p_id uuid, p_email text, p_role text, p_full_name text, p_phone text,
  p_app_meta jsonb default '{"provider": "email", "providers": ["email"]}'
)
returns void
language sql
as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('Demo1234', extensions.gen_salt('bf')), pg_temp.at('-60 days'),
    p_app_meta,
    jsonb_build_object('role', p_role, 'full_name', p_full_name, 'phone', p_phone),
    pg_temp.at('-60 days'), pg_temp.at('-60 days'),
    '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    p_id::text, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', pg_temp.at('-60 days'), pg_temp.at('-60 days'), pg_temp.at('-60 days')
  );
$$;

-- A load is inserted open and then moved to its final status, because the
-- accepted offer it points to is created after it (as accept_offer does).
create function pg_temp.seed_load(
  p_id uuid, p_shipper uuid, p_created_by uuid,
  p_origin text[], p_origin_lat double precision, p_origin_lng double precision,
  p_destination text[], p_destination_lat double precision, p_destination_lng double precision,
  p_pickup_from interval, p_pickup_hours integer, p_delivery_from interval, p_delivery_hours integer,
  p_cargo public.cargo_type, p_description text, p_weight_kg numeric, p_volume_m3 numeric,
  p_unit public.unit_type, p_requirements public.special_requirement[], p_price_cents bigint, p_notes text
)
returns void
language sql
as $$
  insert into public.loads (
    id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, volume_m3, unit_type, special_requirements, proposed_price_cents, notes,
    published_at, created_by, created_at, updated_at
  )
  select
    p_id, p_shipper, 'published',
    p_origin[1], p_origin[2], p_origin[3], p_origin_lat, p_origin_lng,
    p_destination[1], p_destination[2], p_destination[3], p_destination_lat, p_destination_lng,
    pg_temp.at(p_pickup_from), pg_temp.at(p_pickup_from) + make_interval(hours => p_pickup_hours),
    pg_temp.at(p_delivery_from), pg_temp.at(p_delivery_from) + make_interval(hours => p_delivery_hours),
    p_cargo, p_description, p_weight_kg, p_volume_m3, p_unit, p_requirements, p_price_cents, p_notes,
    v.created_at, p_created_by, v.created_at, v.created_at
  from (select least(pg_temp.at(p_pickup_from) - interval '2 days', pg_temp.at('-1 day')) as created_at) v;
$$;

-- ---------------------------------------------------------------------------
-- Users (password for all of them: Demo1234)
-- ---------------------------------------------------------------------------
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000001', 'admin@demo.test', 'shipper', 'Administración Demo', '+52 81 1000 0001');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000002', 'ana.garza@demo.test', 'shipper', 'Ana Garza', '+52 81 1000 0002');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000003', 'luis.ramirez@demo.test', 'shipper', 'Luis Ramírez', '+52 33 1000 0003');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000004', 'sofia.trevino@demo.test', 'shipper', 'Sofía Treviño', '+52 81 1000 0004');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000005', 'jorge.villarreal@demo.test', 'manager', 'Jorge Villarreal', '+52 81 1000 0005');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000006', 'carmen.navarro@demo.test', 'manager', 'Carmen Navarro', '+52 33 1000 0006');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000007', 'jose.sanchez@demo.test', 'manager', 'José Sánchez Medina', '+52 81 1000 0007');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000008', 'pedro.lopez@demo.test', 'operator', 'Pedro López', '+52 81 1000 0008', '{"provider": "email", "providers": ["email"], "provisioned_by": "redeem-invitation"}');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000009', 'raul.mendez@demo.test', 'operator', 'Raúl Méndez', '+52 81 1000 0009', '{"provider": "email", "providers": ["email"], "provisioned_by": "redeem-invitation"}');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000010', 'miguel.hernandez@demo.test', 'operator', 'Miguel Hernández', '+52 33 1000 0010', '{"provider": "email", "providers": ["email"], "provisioned_by": "redeem-invitation"}');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000011', 'andrea.cavazos@demo.test', 'coordinator', 'Andrea Cavazos', '+52 81 1000 0014');
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000012', 'hector.ibarra@demo.test', 'coordinator', 'Héctor Ibarra', '+52 81 1000 0015');
-- Phone-only operator (D15-E1, G2): signs in with +52 81 1000 0013 (the
-- synthetic Auth email of that phone) and the demo password.
select pg_temp.seed_user('5eed0001-0000-4000-8000-000000000013', '528110000013@tel.transport.invalid', 'operator', 'Iván Garza', '+52 81 1000 0013', '{"provider": "email", "providers": ["email"], "provisioned_by": "redeem-invitation"}');

-- Admins cannot sign up (handle_new_user): they are promoted by the database
-- owner, as with the service role in staging and production.
update public.profiles set role = 'admin' where id = '5eed0001-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Companies, all approved by the admin, with their fiscal data (D16, G2)
-- ---------------------------------------------------------------------------
insert into public.companies (
  id, type, legal_name, rfc, status, contact_name, contact_email, contact_phone,
  fiscal_street, fiscal_exterior_number, fiscal_interior_number, fiscal_neighborhood,
  fiscal_postal_code, fiscal_municipality, fiscal_state, legal_representative_name,
  created_by, created_at
)
values
  ('5eed0002-0000-4000-8000-000000000001', 'shipper', 'Aceros del Norte, S.A. de C.V.', 'ADN150301KQ2', 'approved',
   'Ana Garza', 'ana.garza@demo.test', '+528110000002',
   'Av. Churubusco', '3900', null, 'Fierro', '64590', 'Monterrey', 'Nuevo León', 'Ana Garza Elizondo',
   '5eed0001-0000-4000-8000-000000000002', pg_temp.at('-60 days')),
  ('5eed0002-0000-4000-8000-000000000002', 'shipper', 'Alimentos de Occidente, S.A. de C.V.', 'AOC160315MX4', 'approved',
   'Luis Ramírez', 'luis.ramirez@demo.test', '+523310000003',
   'Av. Lázaro Cárdenas', '2305', 'Piso 4', 'Las Torres', '44920', 'Guadalajara', 'Jalisco', 'Luis Ramírez Orozco',
   '5eed0001-0000-4000-8000-000000000003', pg_temp.at('-60 days')),
  ('5eed0002-0000-4000-8000-000000000003', 'shipper', 'Empaques Plásticos Regios, S.A. de C.V.', 'EPR170620HT8', 'approved',
   'Sofía Treviño', 'sofia.trevino@demo.test', '+528110000004',
   'Carretera Miguel Alemán', 'Km 22', null, 'Parque Industrial Milenium', '66600', 'Apodaca', 'Nuevo León', 'Sofía Treviño Garza',
   '5eed0001-0000-4000-8000-000000000004', pg_temp.at('-60 days')),
  ('5eed0002-0000-4000-8000-000000000004', 'carrier', 'Transportes Regios del Norte, S.A. de C.V.', 'TRN120210LP5', 'approved',
   'Jorge Villarreal', 'jorge.villarreal@demo.test', '+528110000005',
   'Av. Ruiz Cortines', '1500', 'Nave 3', 'Mitras Norte', '64320', 'Monterrey', 'Nuevo León', 'Jorge Villarreal Cantú',
   '5eed0001-0000-4000-8000-000000000005', pg_temp.at('-60 days')),
  ('5eed0002-0000-4000-8000-000000000005', 'carrier', 'Fletes Tapatíos, S.A. de C.V.', 'FTA140505RS6', 'approved',
   'Carmen Navarro', 'carmen.navarro@demo.test', '+523310000006',
   'Periférico Sur', '7800', null, 'Santa María Tequepexpan', '45601', 'San Pedro Tlaquepaque', 'Jalisco', 'Carmen Navarro Ruiz',
   '5eed0001-0000-4000-8000-000000000006', pg_temp.at('-60 days')),
  -- Hombre-camión: persona física (13-character RFC), also its own operator;
  -- a persona física is their own legal representative.
  ('5eed0002-0000-4000-8000-000000000006', 'carrier', 'José Sánchez Medina', 'SAMJ800417TD3', 'approved',
   'José Sánchez Medina', 'jose.sanchez@demo.test', '+528110000007',
   'Calle Hidalgo', '218', null, 'Centro', '66400', 'San Nicolás de los Garza', 'Nuevo León', null,
   '5eed0001-0000-4000-8000-000000000007', pg_temp.at('-60 days'));

update public.profiles p
set company_id = v.company_id
from (values
  ('5eed0001-0000-4000-8000-000000000002'::uuid, '5eed0002-0000-4000-8000-000000000001'::uuid),
  ('5eed0001-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000002'),
  ('5eed0001-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000003'),
  ('5eed0001-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000004'),
  ('5eed0001-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000005'),
  ('5eed0001-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000006'),
  -- Operators joined through an accepted invitation (D15).
  ('5eed0001-0000-4000-8000-000000000008', '5eed0002-0000-4000-8000-000000000004'),
  ('5eed0001-0000-4000-8000-000000000009', '5eed0002-0000-4000-8000-000000000004'),
  ('5eed0001-0000-4000-8000-000000000010', '5eed0002-0000-4000-8000-000000000005'),
  ('5eed0001-0000-4000-8000-000000000013', '5eed0002-0000-4000-8000-000000000004'),
  -- Coordinators joined through an invitation (G1b).
  ('5eed0001-0000-4000-8000-000000000011', '5eed0002-0000-4000-8000-000000000004'),
  ('5eed0001-0000-4000-8000-000000000012', '5eed0002-0000-4000-8000-000000000004')
) as v(profile_id, company_id)
where p.id = v.profile_id;

-- ---------------------------------------------------------------------------
-- Operators (6 here, plus the phone-only one below) and units (8)
-- ---------------------------------------------------------------------------
insert into public.operators (id, company_id, profile_id, full_name, email, phone, license_number, license_type, license_expires_on)
values
  ('5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000008',
   'Pedro López', 'pedro.lopez@demo.test', '+52 81 1000 0008', 'NL-E-0412873', 'E', (pg_temp.at('2 years'))::date),
  ('5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000009',
   'Raúl Méndez', 'raul.mendez@demo.test', '+52 81 1000 0009', 'NL-E-0398211', 'E', (pg_temp.at('18 months'))::date),
  -- No account yet: shows the invitation flow (D15).
  ('5eed0003-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000004', null,
   'Arturo Cantú', 'arturo.cantu@demo.test', '+52 81 1000 0011', 'NL-B-0233190', 'B', (pg_temp.at('1 year'))::date),
  ('5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000010',
   'Miguel Hernández', 'miguel.hernandez@demo.test', '+52 33 1000 0010', 'JA-C-0876544', 'C', (pg_temp.at('2 years'))::date),
  ('5eed0003-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000005', null,
   'Daniel Ortiz', 'daniel.ortiz@demo.test', '+52 33 1000 0012', 'JA-E-0911235', 'E', (pg_temp.at('20 months'))::date),
  -- The hombre-camión drives its own truck (D13): linked to the carrier user.
  ('5eed0003-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000007',
   'José Sánchez Medina', 'jose.sanchez@demo.test', '+52 81 1000 0007', 'NL-C-0654321', 'C', (pg_temp.at('3 years'))::date);

insert into public.vehicles (id, company_id, kind, plate, fleet_number, model_year, unit_type, capacity_kg, capacity_m3, features, current_operator_id)
values
  -- Transportes Regios del Norte (Monterrey)
  ('5eed0004-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000004', 'tractor', '41AK7F', 'TRN-01', 2021,
   null, null, null, '{}', '5eed0003-0000-4000-8000-000000000001'),
  ('5eed0004-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000004', 'trailer', '82UR4C', 'CS53-01', 2020,
   'dry_van', 30000, 100, '{}', null),
  ('5eed0004-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000004', 'trailer', '73UJ9D', 'RF53-01', 2022,
   'refrigerated', 28000, 85, '{temperature_control}', '5eed0003-0000-4000-8000-000000000002'),
  ('5eed0004-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000004', 'rigid', '25AP8K', 'TT-01', 2019,
   'torton', 14000, 45, '{tarp}', '5eed0003-0000-4000-8000-000000000003'),
  -- Fletes Tapatíos (Guadalajara)
  ('5eed0004-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000005', 'tractor', '58UN2B', 'FT-01', 2018,
   null, null, null, '{}', '5eed0003-0000-4000-8000-000000000005'),
  ('5eed0004-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000005', 'trailer', '61UW3H', 'PL-01', 2017,
   'flatbed', 32000, null, '{tarp,cargo_securing}', null),
  ('5eed0004-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000005', 'rigid', '39AT5M', 'RB-01', 2020,
   'rabon', 8000, 30, '{liftgate}', '5eed0003-0000-4000-8000-000000000004'),
  -- José Sánchez Medina (hombre-camión)
  ('5eed0004-0000-4000-8000-000000000008', '5eed0002-0000-4000-8000-000000000006', 'rigid', '47AF6R', 'JSM-01', 2016,
   'torton', 15000, 48, '{tarp}', '5eed0003-0000-4000-8000-000000000006');

insert into public.carrier_routes (company_id, origin_city, origin_state, origin_location, destination_city, destination_state, destination_location, unit_types, notes)
values
  ('5eed0002-0000-4000-8000-000000000004', 'Monterrey', 'Nuevo León', 'SRID=4326;POINT(-100.3161 25.6866)',
   'Guadalajara', 'Jalisco', 'SRID=4326;POINT(-103.3496 20.6597)', '{dry_van,refrigerated}', 'Salidas diarias.'),
  ('5eed0002-0000-4000-8000-000000000004', 'Guadalajara', 'Jalisco', 'SRID=4326;POINT(-103.3496 20.6597)',
   'Monterrey', 'Nuevo León', 'SRID=4326;POINT(-100.3161 25.6866)', '{dry_van,refrigerated}', 'Buscamos carga de regreso.'),
  ('5eed0002-0000-4000-8000-000000000005', 'Guadalajara', 'Jalisco', 'SRID=4326;POINT(-103.3496 20.6597)',
   'Monterrey', 'Nuevo León', 'SRID=4326;POINT(-100.3161 25.6866)', '{flatbed,rabon}', null),
  ('5eed0002-0000-4000-8000-000000000005', 'Monterrey', 'Nuevo León', 'SRID=4326;POINT(-100.3161 25.6866)',
   'Guadalajara', 'Jalisco', 'SRID=4326;POINT(-103.3496 20.6597)', '{rabon}', null),
  ('5eed0002-0000-4000-8000-000000000006', 'Monterrey', 'Nuevo León', 'SRID=4326;POINT(-100.3161 25.6866)',
   'Guadalajara', 'Jalisco', 'SRID=4326;POINT(-103.3496 20.6597)', '{torton}', null),
  ('5eed0002-0000-4000-8000-000000000006', 'Monterrey', 'Nuevo León', 'SRID=4326;POINT(-100.3161 25.6866)',
   'Saltillo', 'Coahuila', 'SRID=4326;POINT(-100.9737 25.4383)', '{torton}', null);

-- ---------------------------------------------------------------------------
-- Documents: everything approved except the insurance of the flatbed of
-- Fletes Tapatíos, which waits in the admin review queue (that unit is not
-- ready for matching until it is approved). The files are not uploaded: the
-- viewer shows the metadata only (see docs/demo-local.md).
-- ---------------------------------------------------------------------------
insert into public.documents (
  company_id, requirement_id, owner_type, owner_id, storage_path, file_name, mime_type, size_bytes,
  status, reviewed_by, reviewed_at, expires_at, submitted_by, created_at
)
select
  o.company_id, r.id, r.owner_type, o.owner_id,
  o.company_id || '/' || r.owner_type || '/' || o.owner_id || '/' || gen_random_uuid() || '.pdf',
  r.code || '.pdf', 'application/pdf', 245760,
  case when pending then 'pending_review' else 'approved' end::public.verification_status,
  case when not pending then '5eed0001-0000-4000-8000-000000000001'::uuid end,
  case when not pending then pg_temp.at('-55 days') end,
  case when r.requires_expiry then coalesce(o.expires_at, pg_temp.at('1 year')) end,
  c.created_by,
  case when pending then pg_temp.at('-1 day') else pg_temp.at('-58 days') end
from (
  select c.id as company_id, 'company'::public.document_owner_type as owner_type, c.id as owner_id, null::timestamptz as expires_at
  from public.companies c where c.id::text like '5eed0002-%'
  union all
  select v.company_id, 'vehicle', v.id, null from public.vehicles v where v.id::text like '5eed0004-%'
  union all
  select op.company_id, 'operator', op.id, op.license_expires_on::timestamptz
  from public.operators op where op.id::text like '5eed0003-%'
) o
join public.companies c on c.id = o.company_id
join public.document_requirements r
  on r.owner_type = o.owner_type
 and r.archived_at is null
 and (r.company_type is null or r.company_type = c.type)
 and (r.taxpayer_type is null or r.taxpayer_type = public.taxpayer_type_for_rfc(c.rfc))
cross join lateral (
  select o.owner_id = '5eed0004-0000-4000-8000-000000000006' and r.code = 'vehicle_insurance_policy' as pending
) p;

-- ---------------------------------------------------------------------------
-- Availability of the units with a body (the unit of the trip in unloading
-- gets its availability from the trip, below).
-- ---------------------------------------------------------------------------
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source, created_by)
values
  ('5eed0002-0000-4000-8000-000000000004', '5eed0004-0000-4000-8000-000000000003', pg_temp.at('6 hours'),
   'SRID=4326;POINT(-100.3161 25.6866)', 'Monterrey', 'Nuevo León', 'manual', '5eed0001-0000-4000-8000-000000000005'),
  ('5eed0002-0000-4000-8000-000000000004', '5eed0004-0000-4000-8000-000000000004', pg_temp.at('1 day'),
   'SRID=4326;POINT(-100.9737 25.4383)', 'Saltillo', 'Coahuila', 'manual', '5eed0001-0000-4000-8000-000000000005'),
  ('5eed0002-0000-4000-8000-000000000005', '5eed0004-0000-4000-8000-000000000006', pg_temp.at('0 hours'),
   'SRID=4326;POINT(-103.3496 20.6597)', 'Guadalajara', 'Jalisco', 'manual', '5eed0001-0000-4000-8000-000000000006'),
  ('5eed0002-0000-4000-8000-000000000006', '5eed0004-0000-4000-8000-000000000008', pg_temp.at('12 hours'),
   'SRID=4326;POINT(-100.3161 25.6866)', 'Monterrey', 'Nuevo León', 'manual', '5eed0001-0000-4000-8000-000000000007');

-- ---------------------------------------------------------------------------
-- Loads (15). Shippers: S1 Aceros del Norte (MTY), S2 Alimentos de Occidente
-- (GDL), S3 Empaques Plásticos Regios (MTY).
-- ---------------------------------------------------------------------------
select pg_temp.seed_load(id::uuid, shipper::uuid, created_by::uuid, origin, olat, olng, destination, dlat, dlng,
                         pickup_from::interval, pickup_hours, delivery_from::interval, delivery_hours,
                         cargo::public.cargo_type, description, weight_kg, volume_m3, unit::public.unit_type,
                         requirements::public.special_requirement[], price_cents, notes)
from (values
  -- 01 · MTY -> GDL · in_progress: the trip is unloading in Guadalajara.
  ('5eed0005-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000002',
   array['Av. Ruiz Cortines 2333, Col. Industrial', 'Monterrey', 'Nuevo León'], 25.7016, -100.3392,
   array['Calle 2 No. 1250, Zona Industrial', 'Guadalajara', 'Jalisco'], 20.6280, -103.3560,
   '-20 hours', 4, '-4 hours', 8, 'palletized', 'Perfiles de acero galvanizado en tarimas', 22000, 70, 'dry_van', '{}', 4000000,
   'Descarga en andén 4. Presentarse con EPP.'),
  -- 02 · GDL -> MTY · published: the return trip of the unit of load 01 (B08).
  ('5eed0005-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003',
   array['Av. Lázaro Cárdenas 3420, Col. Jardines de San Ignacio', 'Guadalajara', 'Jalisco'], 20.6560, -103.3910,
   array['Av. Miguel Alemán 5400, Col. Valle de Huinalá', 'Monterrey', 'Nuevo León'], 25.7240, -100.2010,
   '4 hours', 26, '20 hours', 36, 'palletized', 'Abarrotes secos en tarimas emplayadas', 18000, 60, 'dry_van', '{}', 3900000,
   'Cita de carga a partir de las 7:00.'),
  -- 03 · GDL -> MTY · published · refrigerated.
  ('5eed0005-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003',
   array['Carretera a Chapala Km 12.5', 'Tlaquepaque', 'Jalisco'], 20.5810, -103.3220,
   array['Av. Los Ángeles 1200, Col. Nogalar', 'San Nicolás de los Garza', 'Nuevo León'], 25.7310, -100.2960,
   '1 day', 12, '2 days', 12, 'perishable', 'Lácteos y quesos a 4 °C', 20000, 70, 'refrigerated', '{temperature_control}', 5200000, null),
  -- 04 · León -> MTY · published · dry van (farther from Guadalajara than 02).
  ('5eed0005-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000004',
   array['Blvd. Aeropuerto 1200, Parque Industrial', 'León', 'Guanajuato'], 21.0480, -101.5700,
   array['Carretera Miguel Alemán Km 21, Parque Industrial', 'Apodaca', 'Nuevo León'], 25.7817, -100.1886,
   '10 hours', 24, '30 hours', 24, 'general', 'Calzado en cajas de cartón', 9000, 55, 'dry_van', '{}', 3200000, null),
  -- 05 · MTY -> GDL · published · flatbed with tarp and securing.
  ('5eed0005-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000002',
   array['Av. Ruiz Cortines 2333, Col. Industrial', 'Monterrey', 'Nuevo León'], 25.7016, -100.3392,
   array['Periférico Sur 7980, Col. Santa María Tequepexpan', 'Tlaquepaque', 'Jalisco'], 20.6110, -103.4180,
   '1 day', 10, '2 days', 10, 'construction_materials', 'Rollos de lámina de acero', 28000, null, 'flatbed', '{tarp,cargo_securing}', 4800000,
   'Se requieren cadenas y lona.'),
  -- 06 · MTY -> GDL · negotiating: the hombre-camión offered.
  ('5eed0005-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000002',
   array['Av. Ruiz Cortines 2333, Col. Industrial', 'Monterrey', 'Nuevo León'], 25.7016, -100.3392,
   array['Av. Vallarta 6503, Col. Ciudad Granja', 'Zapopan', 'Jalisco'], 20.6770, -103.4370,
   '2 days', 8, '3 days', 8, 'general', 'Herrajes y tornillería en cajas', 11000, 35, 'torton', '{}', 3000000, null),
  -- 07 · Zapopan -> MTY · negotiating: offer and counteroffer.
  ('5eed0005-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003',
   array['Av. Aviación 4800, Col. San Juan de Ocotán', 'Zapopan', 'Jalisco'], 20.7214, -103.3918,
   array['Av. Constitución 1500, Col. Centro', 'Monterrey', 'Nuevo León'], 25.6714, -100.3090,
   '2 days', 12, '3 days', 12, 'construction_materials', 'Varilla corrugada en atados', 30000, null, 'flatbed', '{cargo_securing}', 4400000, null),
  -- 08 · MTY -> GDL · draft.
  ('5eed0005-0000-4000-8000-000000000008', '5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000004',
   array['Av. Santa Rosa 300, Parque Industrial Kalos', 'Apodaca', 'Nuevo León'], 25.7700, -100.1700,
   array['Calle 8 No. 2700, Zona Industrial', 'Guadalajara', 'Jalisco'], 20.6330, -103.3610,
   '4 days', 8, '5 days', 8, 'palletized', 'Envases PET en tarimas', 7000, 80, 'dry_van', '{}', 3600000, null),
  -- 09 · MTY -> GDL · contracted: trip assigned, pickup tomorrow.
  ('5eed0005-0000-4000-8000-000000000009', '5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000004',
   array['Av. Santa Rosa 300, Parque Industrial Kalos', 'Apodaca', 'Nuevo León'], 25.7700, -100.1700,
   array['Av. 8 de Julio 2950, Col. Zona Industrial', 'Guadalajara', 'Jalisco'], 20.6380, -103.3640,
   '20 hours', 6, '40 hours', 8, 'palletized', 'Película estirable en tarimas', 6500, 28, 'rabon', '{liftgate}', 2300000, null),
  -- 10 · MTY -> GDL · completed last week.
  ('5eed0005-0000-4000-8000-000000000010', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000002',
   array['Av. Ruiz Cortines 2333, Col. Industrial', 'Monterrey', 'Nuevo León'], 25.7016, -100.3392,
   array['Calle 2 No. 1250, Zona Industrial', 'Guadalajara', 'Jalisco'], 20.6280, -103.3560,
   '-8 days', 4, '-174 hours', 8, 'palletized', 'Perfiles de acero galvanizado en tarimas', 21000, 68, 'dry_van', '{}', 4000000, null),
  -- 11 · GDL -> MTY · completed by the hombre-camión.
  ('5eed0005-0000-4000-8000-000000000011', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003',
   array['Av. Lázaro Cárdenas 3420, Col. Jardines de San Ignacio', 'Guadalajara', 'Jalisco'], 20.6560, -103.3910,
   array['Av. Miguel Alemán 5400, Col. Valle de Huinalá', 'Monterrey', 'Nuevo León'], 25.7240, -100.2010,
   '-6 days', 6, '-126 hours', 8, 'general', 'Botanas y dulces en cajas', 9500, 40, 'torton', '{}', 2800000, null),
  -- 12 · GDL -> MTY · cancelled by the shipper.
  ('5eed0005-0000-4000-8000-000000000012', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003',
   array['Av. Lázaro Cárdenas 3420, Col. Jardines de San Ignacio', 'Guadalajara', 'Jalisco'], 20.6560, -103.3910,
   array['Av. Los Ángeles 1200, Col. Nogalar', 'San Nicolás de los Garza', 'Nuevo León'], 25.7310, -100.2960,
   '3 days', 8, '4 days', 8, 'palletized', 'Abarrotes secos en tarimas', 15000, 50, 'dry_van', '{}', 3800000, null),
  -- 13 · MTY -> Tlaquepaque · expired without offers.
  ('5eed0005-0000-4000-8000-000000000013', '5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000004',
   array['Av. Santa Rosa 300, Parque Industrial Kalos', 'Apodaca', 'Nuevo León'], 25.7700, -100.1700,
   array['Carretera a Chapala Km 12.5', 'Tlaquepaque', 'Jalisco'], 20.5810, -103.3220,
   '-3 days', 8, '-2 days', 8, 'palletized', 'Tapas plásticas en cajas', 5000, 30, 'dry_van', '{}', 3400000, null),
  -- 14 · Saltillo -> GDL · published · torton.
  ('5eed0005-0000-4000-8000-000000000014', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000002',
   array['Blvd. Isidro López Zertuche 4000, Parque Industrial', 'Saltillo', 'Coahuila'], 25.4383, -100.9737,
   array['Av. 8 de Julio 2950, Col. Zona Industrial', 'Guadalajara', 'Jalisco'], 20.6380, -103.3640,
   '30 hours', 10, '50 hours', 10, 'general', 'Autopartes en contenedores retornables', 12000, 40, 'torton', '{}', 2900000, null),
  -- 15 · Tlaquepaque -> Apodaca · published · torton.
  ('5eed0005-0000-4000-8000-000000000015', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003',
   array['Carretera a Chapala Km 12.5', 'Tlaquepaque', 'Jalisco'], 20.5810, -103.3220,
   array['Carretera Miguel Alemán Km 21, Parque Industrial', 'Apodaca', 'Nuevo León'], 25.7817, -100.1886,
   '2 days', 12, '3 days', 12, 'general', 'Muebles desarmados en cajas', 8000, 45, 'torton', '{}', 2700000, null)
) as l(id, shipper, created_by, origin, olat, olng, destination, dlat, dlng, pickup_from, pickup_hours,
       delivery_from, delivery_hours, cargo, description, weight_kg, volume_m3, unit, requirements, price_cents, notes);

update public.loads set status = 'draft', published_at = null where id = '5eed0005-0000-4000-8000-000000000008';
update public.loads set status = 'expired' where id = '5eed0005-0000-4000-8000-000000000013';

-- ---------------------------------------------------------------------------
-- Negotiations and offers
-- ---------------------------------------------------------------------------
insert into public.negotiations (id, load_id, shipper_company_id, carrier_company_id, created_by, created_at)
select n.id::uuid, n.load_id::uuid, l.shipper_company_id, n.carrier::uuid, n.created_by::uuid, pg_temp.at(n.created_at::interval)
from (values
  ('5eed0006-0000-4000-8000-000000000001', '5eed0005-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000005', '-34 hours'),
  ('5eed0006-0000-4000-8000-000000000002', '5eed0005-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000007', '-33 hours'),
  ('5eed0006-0000-4000-8000-000000000003', '5eed0005-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000007', '-5 hours'),
  ('5eed0006-0000-4000-8000-000000000004', '5eed0005-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000006', '-20 hours'),
  ('5eed0006-0000-4000-8000-000000000005', '5eed0005-0000-4000-8000-000000000009', '5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000006', '-6 hours'),
  ('5eed0006-0000-4000-8000-000000000006', '5eed0005-0000-4000-8000-000000000010', '5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000005', '-9 days'),
  ('5eed0006-0000-4000-8000-000000000007', '5eed0005-0000-4000-8000-000000000011', '5eed0002-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000007', '-7 days'),
  ('5eed0006-0000-4000-8000-000000000008', '5eed0005-0000-4000-8000-000000000012', '5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000006', '-20 hours')
) as n(id, load_id, carrier, created_by, created_at)
join public.loads l on l.id = n.load_id::uuid;

insert into public.offers (
  id, negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents, conditions, vehicle_id,
  status, status_reason, parent_offer_id, created_by, created_at, responded_by, responded_at
)
select o.id::uuid, n.id, n.load_id, n.shipper_company_id, n.carrier_company_id, o.side::public.offer_side, o.amount_cents,
       o.conditions, o.vehicle_id::uuid, o.status::public.offer_status, o.status_reason, o.parent_offer_id::uuid,
       o.created_by::uuid, pg_temp.at(o.created_at::interval), o.responded_by::uuid, pg_temp.at(o.responded_at::interval)
from (values
  -- Load 01: Transportes Regios offers, the shipper counters, the carrier accepts.
  ('5eed0007-0000-4000-8000-000000000001', '5eed0006-0000-4000-8000-000000000001', 'carrier', 4500000,
   'Caja seca de 53 pies. Incluye seguro de carga.', '5eed0004-0000-4000-8000-000000000002', 'countered', null, null,
   '5eed0001-0000-4000-8000-000000000005', '-34 hours', '5eed0001-0000-4000-8000-000000000002', '-32 hours'),
  ('5eed0007-0000-4000-8000-000000000002', '5eed0006-0000-4000-8000-000000000001', 'shipper', 4200000,
   'Pago a 15 días.', null, 'accepted', null, '5eed0007-0000-4000-8000-000000000001',
   '5eed0001-0000-4000-8000-000000000002', '-32 hours', '5eed0001-0000-4000-8000-000000000005', '-30 hours'),
  -- Load 01: the hombre-camión lost it.
  ('5eed0007-0000-4000-8000-000000000003', '5eed0006-0000-4000-8000-000000000002', 'carrier', 4300000,
   null, '5eed0004-0000-4000-8000-000000000008', 'rejected', 'other_offer_accepted', null,
   '5eed0001-0000-4000-8000-000000000007', '-33 hours', '5eed0001-0000-4000-8000-000000000005', '-30 hours'),
  -- Load 06: pending offer of the hombre-camión.
  ('5eed0007-0000-4000-8000-000000000004', '5eed0006-0000-4000-8000-000000000003', 'carrier', 3100000,
   'Torton con lona. Disponible desde mañana.', '5eed0004-0000-4000-8000-000000000008', 'pending', null, null,
   '5eed0001-0000-4000-8000-000000000007', '-5 hours', null, null),
  -- Load 07: Fletes Tapatíos offers, the shipper counters (pending for the carrier).
  ('5eed0007-0000-4000-8000-000000000005', '5eed0006-0000-4000-8000-000000000004', 'carrier', 4800000,
   'Plataforma con cadenas.', '5eed0004-0000-4000-8000-000000000006', 'countered', null, null,
   '5eed0001-0000-4000-8000-000000000006', '-20 hours', '5eed0001-0000-4000-8000-000000000003', '-3 hours'),
  ('5eed0007-0000-4000-8000-000000000006', '5eed0006-0000-4000-8000-000000000004', 'shipper', 4500000,
   'Incluye maniobras de carga.', null, 'pending', null, '5eed0007-0000-4000-8000-000000000005',
   '5eed0001-0000-4000-8000-000000000003', '-3 hours', null, null),
  -- Load 09: accepted offer of Fletes Tapatíos.
  ('5eed0007-0000-4000-8000-000000000007', '5eed0006-0000-4000-8000-000000000005', 'carrier', 2200000,
   'Rabón con rampa.', '5eed0004-0000-4000-8000-000000000007', 'accepted', null, null,
   '5eed0001-0000-4000-8000-000000000006', '-6 hours', '5eed0001-0000-4000-8000-000000000004', '-4 hours'),
  -- Load 10: accepted offer of Transportes Regios.
  ('5eed0007-0000-4000-8000-000000000008', '5eed0006-0000-4000-8000-000000000006', 'carrier', 4100000,
   null, '5eed0004-0000-4000-8000-000000000002', 'accepted', null, null,
   '5eed0001-0000-4000-8000-000000000005', '-9 days', '5eed0001-0000-4000-8000-000000000002', '-206 hours'),
  -- Load 11: accepted offer of the hombre-camión.
  ('5eed0007-0000-4000-8000-000000000009', '5eed0006-0000-4000-8000-000000000007', 'carrier', 2900000,
   null, '5eed0004-0000-4000-8000-000000000008', 'accepted', null, null,
   '5eed0001-0000-4000-8000-000000000007', '-7 days', '5eed0001-0000-4000-8000-000000000003', '-158 hours'),
  -- Load 12: offer closed when the shipper cancelled the load.
  ('5eed0007-0000-4000-8000-000000000010', '5eed0006-0000-4000-8000-000000000008', 'carrier', 4000000,
   null, null, 'rejected', 'load_cancelled', null,
   '5eed0001-0000-4000-8000-000000000006', '-20 hours', '5eed0001-0000-4000-8000-000000000003', '-2 hours')
) as o(id, negotiation_id, side, amount_cents, conditions, vehicle_id, status, status_reason, parent_offer_id,
       created_by, created_at, responded_by, responded_at)
join public.negotiations n on n.id = o.negotiation_id::uuid
order by o.id;

-- Final status of the loads that were negotiated.
update public.loads set status = 'negotiating'
where id in ('5eed0005-0000-4000-8000-000000000006', '5eed0005-0000-4000-8000-000000000007');

update public.loads l
set status = v.status::public.load_status,
    accepted_offer_id = o.id,
    carrier_company_id = o.carrier_company_id,
    agreed_price_cents = o.amount_cents,
    contracted_at = o.responded_at
from (values
  ('5eed0005-0000-4000-8000-000000000001', 'in_progress'),
  ('5eed0005-0000-4000-8000-000000000009', 'contracted'),
  ('5eed0005-0000-4000-8000-000000000010', 'completed'),
  ('5eed0005-0000-4000-8000-000000000011', 'completed')
) as v(load_id, status)
join public.offers o on o.load_id = v.load_id::uuid and o.status = 'accepted'
where l.id = v.load_id::uuid;

update public.loads
set status = 'cancelled', cancelled_at = pg_temp.at('-2 hours'), cancellation_reason = 'El pedido del cliente se pospuso.'
where id = '5eed0005-0000-4000-8000-000000000012';

-- ---------------------------------------------------------------------------
-- Trips and their timelines (D11: every operator event keeps time and place)
-- ---------------------------------------------------------------------------
insert into public.trips (
  id, load_id, offer_id, shipper_company_id, carrier_company_id, status, vehicle_id, operator_id,
  estimated_unload_end_at, assigned_at, started_at, delivered_at, closed_at, created_at
)
select t.id::uuid, l.id, l.accepted_offer_id, l.shipper_company_id, l.carrier_company_id, t.status::public.trip_status,
       t.vehicle_id::uuid, t.operator_id::uuid, pg_temp.at(t.estimate::interval), pg_temp.at(t.assigned_at::interval),
       pg_temp.at(t.started_at::interval), pg_temp.at(t.delivered_at::interval), pg_temp.at(t.closed_at::interval),
       l.contracted_at
from (values
  -- MTY -> GDL unloading; estimated end in 2 hours.
  ('5eed0008-0000-4000-8000-000000000001', '5eed0005-0000-4000-8000-000000000001', 'unloading',
   '5eed0004-0000-4000-8000-000000000002', '5eed0003-0000-4000-8000-000000000001', '2 hours', '-28 hours', '-21 hours', null, null),
  ('5eed0008-0000-4000-8000-000000000002', '5eed0005-0000-4000-8000-000000000009', 'assigned',
   '5eed0004-0000-4000-8000-000000000007', '5eed0003-0000-4000-8000-000000000004', null, '-3 hours', null, null, null),
  ('5eed0008-0000-4000-8000-000000000003', '5eed0005-0000-4000-8000-000000000010', 'closed',
   '5eed0004-0000-4000-8000-000000000002', '5eed0003-0000-4000-8000-000000000001', '-169 hours', '-200 hours', '-192 hours', '-170 hours', '-160 hours'),
  ('5eed0008-0000-4000-8000-000000000004', '5eed0005-0000-4000-8000-000000000011', 'closed',
   '5eed0004-0000-4000-8000-000000000008', '5eed0003-0000-4000-8000-000000000006', '-121 hours', '-150 hours', '-144 hours', '-122 hours', '-110 hours')
) as t(id, load_id, status, vehicle_id, operator_id, estimate, assigned_at, started_at, delivered_at, closed_at)
join public.loads l on l.id = t.load_id::uuid;

-- Operator status events: (event, hours from the reset, lat, lng). The
-- created/assigned events and the delivery confirmation have no location.
insert into public.trip_events (
  trip_id, event_type, from_status, to_status, occurred_at, recorded_at, latitude, longitude, accuracy_m,
  estimated_unload_end_at, notes, actor_id, actor_role
)
select e.trip_id::uuid, e.event_type::public.trip_event_type, e.from_status::public.trip_status,
       e.to_status::public.trip_status, pg_temp.at(e.occurred_at::interval), pg_temp.at(e.occurred_at::interval),
       e.lat, e.lng, case when e.lat is not null then 15 end, pg_temp.at(e.estimate::interval), e.notes,
       e.actor_id::uuid, e.actor_role::public.user_role
from (values
  -- Trip 1 · MTY -> GDL · Pedro López (Transportes Regios)
  ('5eed0008-0000-4000-8000-000000000001', 'created', null, 'pending_assignment', '-30 hours', null::double precision, null::double precision, null, null, '5eed0001-0000-4000-8000-000000000005', 'manager'),
  ('5eed0008-0000-4000-8000-000000000001', 'assigned', 'pending_assignment', 'assigned', '-28 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000005', 'manager'),
  ('5eed0008-0000-4000-8000-000000000001', 'departed', 'assigned', 'en_route_to_pickup', '-21 hours', 25.7480, -100.2650, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000001', 'arrived_at_pickup', 'en_route_to_pickup', 'at_pickup', '-20 hours', 25.7016, -100.3392, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000001', 'loading_started', 'at_pickup', 'loading', '-19 hours', 25.7016, -100.3392, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000001', 'loading_finished', 'loading', 'in_transit', '-17 hours', 25.7016, -100.3392, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000001', 'arrived_at_delivery', 'in_transit', 'at_delivery', '-2 hours', 20.6280, -103.3560, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000001', 'unloading_started', 'at_delivery', 'unloading', '-1 hour', 20.6280, -103.3560, '2 hours', 'Andén 4', '5eed0001-0000-4000-8000-000000000008', 'operator'),
  -- Trip 2 · Apodaca -> GDL · Miguel Hernández (Fletes Tapatíos)
  ('5eed0008-0000-4000-8000-000000000002', 'created', null, 'pending_assignment', '-4 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000004', 'shipper'),
  ('5eed0008-0000-4000-8000-000000000002', 'assigned', 'pending_assignment', 'assigned', '-3 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000006', 'manager'),
  -- Trip 3 · MTY -> GDL last week · Pedro López
  ('5eed0008-0000-4000-8000-000000000003', 'created', null, 'pending_assignment', '-206 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000002', 'shipper'),
  ('5eed0008-0000-4000-8000-000000000003', 'assigned', 'pending_assignment', 'assigned', '-200 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000005', 'manager'),
  ('5eed0008-0000-4000-8000-000000000003', 'departed', 'assigned', 'en_route_to_pickup', '-192 hours', 25.7480, -100.2650, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000003', 'arrived_at_pickup', 'en_route_to_pickup', 'at_pickup', '-191 hours', 25.7016, -100.3392, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000003', 'loading_started', 'at_pickup', 'loading', '-190 hours', 25.7016, -100.3392, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000003', 'loading_finished', 'loading', 'in_transit', '-188 hours', 25.7016, -100.3392, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000003', 'arrived_at_delivery', 'in_transit', 'at_delivery', '-173 hours', 20.6280, -103.3560, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000003', 'unloading_started', 'at_delivery', 'unloading', '-172 hours', 20.6280, -103.3560, '-169 hours', null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000003', 'unloading_finished', 'unloading', 'delivered', '-170 hours', 20.6280, -103.3560, null, null, '5eed0001-0000-4000-8000-000000000008', 'operator'),
  ('5eed0008-0000-4000-8000-000000000003', 'delivery_confirmed', 'delivered', 'closed', '-160 hours', null, null, null, 'Recibido completo.', '5eed0001-0000-4000-8000-000000000002', 'shipper'),
  -- Trip 4 · GDL -> MTY · José Sánchez (hombre-camión, records as carrier)
  ('5eed0008-0000-4000-8000-000000000004', 'created', null, 'pending_assignment', '-158 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000003', 'shipper'),
  ('5eed0008-0000-4000-8000-000000000004', 'assigned', 'pending_assignment', 'assigned', '-150 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'departed', 'assigned', 'en_route_to_pickup', '-144 hours', 20.6700, -103.3500, null, null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'arrived_at_pickup', 'en_route_to_pickup', 'at_pickup', '-143 hours', 20.6560, -103.3910, null, null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'loading_started', 'at_pickup', 'loading', '-142 hours', 20.6560, -103.3910, null, null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'loading_finished', 'loading', 'in_transit', '-141 hours', 20.6560, -103.3910, null, null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'arrived_at_delivery', 'in_transit', 'at_delivery', '-125 hours', 25.7240, -100.2010, null, null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'unloading_started', 'at_delivery', 'unloading', '-124 hours', 25.7240, -100.2010, '-121 hours', null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'unloading_finished', 'unloading', 'delivered', '-122 hours', 25.7240, -100.2010, null, null, '5eed0001-0000-4000-8000-000000000007', 'manager'),
  ('5eed0008-0000-4000-8000-000000000004', 'delivery_confirmed', 'delivered', 'closed', '-110 hours', null, null, null, null, '5eed0001-0000-4000-8000-000000000003', 'shipper')
) as e(trip_id, event_type, from_status, to_status, occurred_at, lat, lng, estimate, notes, actor_id, actor_role);

-- GPS points of the trip in unloading along the corridor (MTY, Saltillo,
-- Matehuala, San Luis Potosí, Ojuelos, Lagos de Moreno, Tepatitlán, GDL).
insert into public.trip_locations (trip_id, recorded_at, latitude, longitude, accuracy_m, speed_mps, heading_deg)
select '5eed0008-0000-4000-8000-000000000001', pg_temp.at(p.at::interval), p.lat, p.lng, 12, p.speed, p.heading
from (values
  ('-21 hours', 25.7480, -100.2650, 9.5, 230.0),
  ('-17 hours', 25.7016, -100.3392, 0.0, 0.0),
  ('-16 hours', 25.4383, -100.9737, 24.0, 250.0),
  ('-14 hours', 23.6486, -100.6447, 25.0, 175.0),
  ('-11 hours', 22.1565, -100.9855, 23.0, 190.0),
  ('-8 hours', 21.8640, -101.5920, 24.5, 240.0),
  ('-6 hours', 21.3566, -101.9300, 22.0, 215.0),
  ('-4 hours', 20.8170, -102.7630, 23.5, 250.0),
  ('-150 minutes', 20.6600, -103.2500, 11.0, 260.0),
  ('-2 hours', 20.6280, -103.3560, 0.0, 0.0)
) as p(at, lat, lng, speed, heading);

-- The units of finished trips are free where they unloaded; the unit in
-- unloading is free in Guadalajara at the estimated end (as
-- set_trip_vehicle_availability does). Return-trip mode of matching (B08).
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source, created_by, created_at, archived_at)
values
  ('5eed0002-0000-4000-8000-000000000004', '5eed0004-0000-4000-8000-000000000002', pg_temp.at('-170 hours'),
   'SRID=4326;POINT(-103.3560 20.6280)', 'Guadalajara', 'Jalisco', 'trip_estimate', '5eed0001-0000-4000-8000-000000000008',
   pg_temp.at('-170 hours'), pg_temp.at('-1 hour')),
  ('5eed0002-0000-4000-8000-000000000004', '5eed0004-0000-4000-8000-000000000002', pg_temp.at('2 hours'),
   'SRID=4326;POINT(-103.3560 20.6280)', 'Guadalajara', 'Jalisco', 'trip_estimate', '5eed0001-0000-4000-8000-000000000008',
   pg_temp.at('-1 hour'), null);

-- ---------------------------------------------------------------------------
-- Chat (conversations are opened by the triggers of B07)
-- ---------------------------------------------------------------------------
insert into public.messages (conversation_id, sender_id, sender_role, body, created_at)
select c.id, m.sender_id::uuid, m.sender_role::public.user_role, m.body, pg_temp.at(m.at::interval)
from (values
  ('5eed0008-0000-4000-8000-000000000001'::uuid, null::uuid, '5eed0001-0000-4000-8000-000000000008', 'operator',
   'Ya estoy en el andén 4, empezamos a descargar.', '-55 minutes'),
  ('5eed0008-0000-4000-8000-000000000001', null, '5eed0001-0000-4000-8000-000000000002', 'shipper',
   'Gracias, Pedro. Avísame cuando terminen.', '-50 minutes'),
  (null, '5eed0006-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000006', 'manager',
   'Podemos recoger pasado mañana temprano con plataforma y cadenas.', '-20 hours'),
  (null, '5eed0006-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000003', 'shipper',
   'Te propongo $45,000 con las maniobras de carga incluidas.', '-3 hours')
) as m(trip_id, negotiation_id, sender_id, sender_role, body, at)
join public.conversations c on c.trip_id = m.trip_id or c.negotiation_id = m.negotiation_id;

update public.conversations c
set last_message_at = (select max(m.created_at) from public.messages m where m.conversation_id = c.id)
where exists (select 1 from public.messages m where m.conversation_id = c.id);

-- ---------------------------------------------------------------------------
-- Business units (G1a.2). Every carrier got its "Principal" business unit when
-- it was created, and everything above went to it. Transportes Regios del
-- Norte splits its fleet in two, each run by its coordinator:
--   * "Corredor MTY–GDL" (Andrea Cavazos): TRN-01, CS53-01 and Pedro López,
--     with the trips and negotiations of the company;
--   * "Regional Monterrey" (Héctor Ibarra): RF53-01, TT-01, Raúl Méndez and
--     Arturo Cantú.
-- Jorge Villarreal, the manager, sees and operates both.
-- ---------------------------------------------------------------------------
update public.business_units set name = 'Corredor MTY–GDL'
where company_id = '5eed0002-0000-4000-8000-000000000004';

insert into public.business_units (id, company_id, name, created_by, created_at)
values ('5eed0009-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000004', 'Regional Monterrey',
        '5eed0001-0000-4000-8000-000000000005', pg_temp.at('-30 days'));

update public.vehicles set business_unit_id = '5eed0009-0000-4000-8000-000000000002'
where id in ('5eed0004-0000-4000-8000-000000000003', '5eed0004-0000-4000-8000-000000000004');
update public.operators set business_unit_id = '5eed0009-0000-4000-8000-000000000002'
where id in ('5eed0003-0000-4000-8000-000000000002', '5eed0003-0000-4000-8000-000000000003');

-- Iván Garza (G2, D15-E1): joined "Regional Monterrey" through an operator
-- link, with a phone and no email. He signs in with his phone.
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, email, phone, license_number, license_type, license_expires_on)
values ('5eed0003-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000004', '5eed0009-0000-4000-8000-000000000002',
        '5eed0001-0000-4000-8000-000000000013', 'Iván Garza', null, '+528110000013', 'NL-B-0518823', 'B', (pg_temp.at('30 months'))::date);
-- His documents (the federal licence, until its expiry) were approved like the
-- other operators' (G9): the demo can assign him without uploading anything.
insert into public.documents (
  company_id, requirement_id, owner_type, owner_id, storage_path, file_name, mime_type, size_bytes,
  status, reviewed_by, reviewed_at, expires_at, submitted_by, created_at
)
select op.company_id, r.id, 'operator', op.id,
       op.company_id || '/operator/' || op.id || '/' || gen_random_uuid() || '.pdf',
       r.code || '.pdf', 'application/pdf', 245760, 'approved', '5eed0001-0000-4000-8000-000000000001',
       pg_temp.at('-25 days'), case when r.requires_expiry then op.license_expires_on::timestamptz end,
       '5eed0001-0000-4000-8000-000000000012', pg_temp.at('-28 days')
from public.operators op
join public.companies c on c.id = op.company_id
join public.document_requirements r
  on r.owner_type = 'operator'
 and r.archived_at is null
 and (r.company_type is null or r.company_type = c.type)
 and (r.taxpayer_type is null or r.taxpayer_type = public.taxpayer_type_for_rfc(c.rfc))
where op.id = '5eed0003-0000-4000-8000-000000000007';

insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id, created_by, created_at)
select b.id, b.company_id, c.profile_id::uuid, '5eed0001-0000-4000-8000-000000000005', pg_temp.at('-30 days')
from (values
  ('Corredor MTY–GDL', '5eed0001-0000-4000-8000-000000000011'),
  ('Regional Monterrey', '5eed0001-0000-4000-8000-000000000012')
) as c(unit_name, profile_id)
join public.business_units b on b.company_id = '5eed0002-0000-4000-8000-000000000004' and b.name = c.unit_name;

-- The hombre-camión (D13).
update public.companies set is_owner_operator = true where id = '5eed0002-0000-4000-8000-000000000006';

-- ---------------------------------------------------------------------------
-- Demo invitation links (G2, LOCAL ONLY): fixed tokens so the sign-up by
-- link can be tried by hand and by Maestro. Jorge invites a coordinator to
-- both business units and Héctor an operator to "Regional Monterrey":
--   /invitacion/demo-coordinador-trn-0000000000000000000000
--   /invitacion/demo-operador-trn-0000000000000000000000000
-- (43 characters each, the shape of a real token). Single use: after one
-- redemption, reset the seed to try again.
-- ---------------------------------------------------------------------------
insert into public.invitations (id, company_id, kind, business_unit_ids, invitee_name, token_hash, expires_at, created_by, created_at)
values
  ('5eed000a-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000004', 'coordinator',
   array(select id from public.business_units where company_id = '5eed0002-0000-4000-8000-000000000004' order by name),
   'Coordinador demo', sha256(convert_to(rpad('demo-coordinador-trn-', 43, '0'), 'UTF8')),
   pg_temp.at('30 days'), '5eed0001-0000-4000-8000-000000000005', pg_temp.at('-1 day')),
  ('5eed000a-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000004', 'operator',
   array['5eed0009-0000-4000-8000-000000000002'::uuid],
   'Operador demo', sha256(convert_to(rpad('demo-operador-trn-', 43, '0'), 'UTF8')),
   pg_temp.at('30 days'), '5eed0001-0000-4000-8000-000000000012', pg_temp.at('-1 day'));

-- ---------------------------------------------------------------------------
-- Notifications queued by the triggers: mark them as already dispatched so the
-- dispatcher (B09) never sends push or email for demo data, and as read when
-- they belong to a finished load.
-- ---------------------------------------------------------------------------
update public.notifications n
set dispatched_at = now(),
    read_at = case when l.status in ('completed', 'cancelled', 'expired') then now() end
from public.loads l
where l.id = (n.data ->> 'loadId')::uuid;

update public.notifications set dispatched_at = now() where dispatched_at is null;
