-- G2 · Registration (D13, D15-E1, D16):
--   * phones: normalize_mx_phone, the sign-up requires one, profiles keep
--     E.164 and reject junk;
--   * an operator account only when the service role provisioned it
--     (app_metadata.provisioned_by, written by redeem-invitation);
--   * register_company by kind (shipper, carrier, owner_operator): the
--     hombre-camión gets its operator row in "Principal"; the wrong role,
--     a second company, a bad RFC or an incomplete fiscal address fail;
--   * company_missing_fields and review_company: no approval with gaps;
--   * the fiscal data is editable in review and frozen once approved;
--   * invitation links for an operator row registered without an account:
--     who may issue one, the preview, and the redemption links that row;
--   * the rate-limit buckets of redeem-invitation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(83);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.new_user(p_id uuid, p_role text, p_phone text default '+52 81 1234 5678', p_app_meta jsonb default null)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g2.test', now(), p_app_meta,
          jsonb_strip_nulls(jsonb_build_object('role', p_role, 'phone', p_phone, 'full_name', 'Prueba ' || p_role)),
          now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.login_service()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '{"role": "service_role"}', true);
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated, service_role;
create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to anon, authenticated, service_role;
create function tests.token(p_name text)
returns text
language sql
stable
as $$ select token from tests.tokens where name = p_name $$;

-- A complete registration payload.
create function tests.payload(p_kind text, p_rfc text, p_extra jsonb default '{}')
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'kind', p_kind,
    'legalName', 'Empresa ' || p_rfc,
    'rfc', p_rfc,
    'fiscalStreet', 'Av. Constitución',
    'fiscalExteriorNumber', '400',
    'fiscalInteriorNumber', 'Piso 2',
    'fiscalNeighborhood', 'Centro',
    'fiscalPostalCode', '64000',
    'fiscalMunicipality', 'Monterrey',
    'fiscalState', 'Nuevo León',
    'legalRepresentativeName', 'Ana Pérez',
    'contactName', 'Ana Pérez',
    'contactEmail', 'Ana@Empresa.MX',
    'contactPhone', '81 1234 5678'
  ) || p_extra;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Phones
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select public.normalize_mx_phone(p) from unnest(array[
       '8112345678', '81 1234 5678', '(81) 1234-5678', '+52 81 1234 5678', '52 81 1234 5678',
       '+52 1 81 1234 5678', '+1 (415) 555-0100', '811234567', 'hola', ''
     ]) p $$,
  $$ values ('+528112345678'), ('+528112345678'), ('+528112345678'), ('+528112345678'), ('+528112345678'),
            ('+528112345678'), ('+14155550100'), (null), (null), (null) $$,
  'normalize_mx_phone mirrors normalizeMxPhone: Mexican numbers get +52, E.164 stays, junk is null'
);

select throws_ok(
  $$ select tests.new_user('a3100000-0000-4000-8000-0000000000f1', 'shipper', null) $$,
  '22023', 'phone is required', 'a sign-up without a phone is refused'
);
select throws_ok(
  $$ select tests.new_user('a3100000-0000-4000-8000-0000000000f2', 'manager', '12') $$,
  '22023', 'phone is required', 'a sign-up with junk for a phone is refused'
);
select throws_ok(
  $$ select tests.new_user('a3100000-0000-4000-8000-0000000000f3', 'operator') $$,
  '42501', 'operator accounts are created only through an invitation',
  'a public sign-up cannot create an operator account'
);
select throws_ok(
  $$ select tests.new_user('a3100000-0000-4000-8000-0000000000f4', 'operator', '+528112345678',
                           '{"provisioned_by": "someone-else"}') $$,
  '42501', 'operator accounts are created only through an invitation',
  'only the Edge Function marker is accepted for operators'
);
select throws_ok(
  $$ insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ('a3100000-0000-4000-8000-0000000000f5', 'authenticated', 'authenticated',
             '528112345678@TEL.transport.invalid',
             '{"role": "manager", "phone": "8112345678", "full_name": "Okupa"}', now(), now()) $$,
  '42501', 'operator accounts are created only through an invitation',
  'a public sign-up cannot take the synthetic email of a phone'
);

-- Provisioning tickets (GoTrue writes app_metadata after the insert, so the
-- Edge Function proves itself with a single-use ticket and its nonce).
create function tests.new_phone_user(p_id uuid, p_email text, p_nonce text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email,
          jsonb_build_object('role', 'operator', 'phone', '8119990001', 'full_name', 'Por Teléfono',
                             'provisioning_nonce', p_nonce),
          now(), now());
$$;
select throws_ok(
  $$ select tests.new_phone_user('a3100000-0000-4000-8000-0000000000f6', '528119990001@tel.transport.invalid',
                                 repeat('n', 64)) $$,
  '42501', 'operator accounts are created only through an invitation',
  'a nonce without a ticket creates nothing'
);
set local role authenticated;
select tests.login('a3100000-0000-4000-8000-0000000000f6');
select throws_ok(
  $$ select public.issue_operator_provisioning_ticket_service('528119990001@tel.transport.invalid', repeat('n', 64)) $$,
  '42501', null, 'only the service role issues tickets'
);
select throws_ok(
  $$ select * from public.operator_provisioning_tickets $$,
  '42501', null, 'clients cannot read the tickets'
);
reset role;
set local role service_role;
select tests.login_service();
select lives_ok(
  $$ select public.issue_operator_provisioning_ticket_service('528119990001@TEL.transport.invalid', repeat('n', 64)) $$,
  'the service role issues a ticket'
);
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select tests.new_phone_user('a3100000-0000-4000-8000-0000000000f6', '528119990001@tel.transport.invalid',
                                 repeat('m', 64)) $$,
  '42501', 'operator accounts are created only through an invitation',
  'the ticket only works with its own nonce'
);
select lives_ok(
  $$ select tests.new_phone_user('a3100000-0000-4000-8000-0000000000f6', '528119990001@tel.transport.invalid',
                                 repeat('n', 64)) $$,
  'with the ticket and its nonce the operator account is created'
);
select results_eq(
  $$ select role::text, phone from public.profiles where id = 'a3100000-0000-4000-8000-0000000000f6' $$,
  $$ values ('operator', '+528119990001') $$,
  'its profile is an operator without a company'
);
select is(
  (select count(*)::int from public.operator_provisioning_tickets where email = '528119990001@tel.transport.invalid'),
  0, 'the ticket is consumed'
);
delete from auth.users where id = 'a3100000-0000-4000-8000-0000000000f6';

-- Users: 01 shipper, 02 manager (carrier), 03 manager (owner-operator),
-- 04 coordinator, 05 operator (provisioned), 06 admin, 07 manager (invites),
-- 08 coordinator of unit B, 09 new operator account, 10 manager without company.
select tests.new_user('a3100000-0000-4000-8000-000000000001', 'shipper', '81 1000 0001');
select tests.new_user('a3100000-0000-4000-8000-000000000002', 'manager', '+52 (81) 1000-0002');
select tests.new_user('a3100000-0000-4000-8000-000000000003', 'manager', '8110000003');
select tests.new_user('a3100000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a3100000-0000-4000-8000-000000000005', 'operator', '8110000005',
                      '{"provisioned_by": "redeem-invitation"}');
select tests.new_user('a3100000-0000-4000-8000-000000000006', 'shipper');
select tests.new_user('a3100000-0000-4000-8000-000000000007', 'manager');
select tests.new_user('a3100000-0000-4000-8000-000000000008', 'coordinator');
select tests.new_user('a3100000-0000-4000-8000-000000000009', 'operator', '8110000009',
                      '{"provisioned_by": "redeem-invitation"}');
select tests.new_user('a3100000-0000-4000-8000-000000000010', 'manager');
update public.profiles set role = 'admin' where id = 'a3100000-0000-4000-8000-000000000006';

select results_eq(
  $$ select phone from public.profiles where id::text like 'a3100000-%' order by id $$,
  $$ values ('+528110000001'), ('+528110000002'), ('+528110000003'), ('+528112345678'), ('+528110000005'),
            ('+528112345678'), ('+528112345678'), ('+528112345678'), ('+528110000009'), ('+528112345678') $$,
  'the sign-up stores every phone in E.164'
);
select is(
  (select role::text from public.profiles where id = 'a3100000-0000-4000-8000-000000000005'),
  'operator', 'a provisioned operator account signs up'
);

set local role authenticated;
select tests.login('a3100000-0000-4000-8000-000000000001');
select lives_ok(
  $$ update public.profiles set phone = '(33) 1000-0001' where id = 'a3100000-0000-4000-8000-000000000001' $$,
  'a user updates their phone'
);
select is(
  (select phone from public.profiles where id = 'a3100000-0000-4000-8000-000000000001'),
  '+523310000001', 'and it is normalized to E.164'
);
select throws_ok(
  $$ update public.profiles set phone = 'no es' where id = 'a3100000-0000-4000-8000-000000000001' $$,
  '22023', 'invalid phone', 'junk for a phone is refused'
);
reset role;

-- ---------------------------------------------------------------------------
-- register_company
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.register_company(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.register_company(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.company_missing_fields(uuid)', 'execute')
  and has_column_privilege('authenticated', 'public.companies', 'fiscal_state', 'update')
  and not has_column_privilege('authenticated', 'public.companies', 'rfc', 'update')
  and not has_column_privilege('authenticated', 'public.companies', 'is_owner_operator', 'update'),
  'register_company and company_missing_fields are for signed-in users; clients update the fiscal columns, never the RFC or the owner-operator flag'
);

set local role authenticated;

-- A shipper.
select tests.login('a3100000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.register_company(tests.payload('carrier', 'CSH010101AB1')) $$,
  '42501', 'role shipper cannot register a carrier company', 'a shipper cannot register a carrier company'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'XAXX010101000')) $$,
  '22023', 'invalid rfc', 'a generic RFC is refused'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ESH011301AB1')) $$,
  '22023', 'invalid rfc', 'an RFC with an impossible date is refused'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ESH010101AB1', '{"fiscalNeighborhood": " "}')) $$,
  '22023', 'the fiscal address is incomplete', 'the fiscal address is required'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ESH010101AB1', '{"fiscalPostalCode": "6400"}')) $$,
  '22023', 'invalid fiscalPostalCode', 'the postal code has five digits'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ESH010101AB1', '{"fiscalState": "Texas"}')) $$,
  '23514', null, 'the state is one of the 32 federative entities'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ESH010101AB1', '{"legalRepresentativeName": null}')) $$,
  '22023', 'legalRepresentativeName is required for a persona moral',
  'a persona moral names its legal representative'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ESH010101AB1', '{"contactPhone": "12"}')) $$,
  '22023', 'invalid contactPhone', 'a contact phone, when given, must be a phone'
);
select throws_ok(
  $$ select public.register_company('[]'::jsonb) $$,
  '22023', 'p_payload must be an object', 'the payload is an object'
);
insert into tests.vals
select 'shipper_company', public.register_company(tests.payload('shipper', 'ESH010101AB1'));
select results_eq(
  $$ select c.type::text, c.legal_name, c.rfc, c.status::text, c.contact_email, c.contact_phone,
            c.fiscal_street, c.fiscal_interior_number, c.fiscal_postal_code, c.fiscal_state,
            c.legal_representative_name, c.is_owner_operator
     from public.companies c where c.id = tests.val('shipper_company') $$,
  $$ values ('shipper', 'Empresa ESH010101AB1', 'ESH010101AB1', 'pending_review', 'ana@empresa.mx', '+528112345678',
             'Av. Constitución', 'Piso 2', '64000', 'Nuevo León', 'Ana Pérez', false) $$,
  'a shipper registers a shipper company in review with its fiscal data'
);
select is(public.auth_company_id(), tests.val('shipper_company'), 'the profile is linked to the company');
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ESH020202AB1')) $$,
  '42501', 'user already belongs to a company', 'register_company cannot be called twice'
);
select is(
  public.company_missing_fields(tests.val('shipper_company')), '{}'::text[],
  'nothing is missing from a complete registration'
);

-- A carrier company.
select tests.login('a3100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'MSH010101AB1')) $$,
  '42501', 'role manager cannot register a shipper company', 'a manager cannot register a shipper company'
);
select throws_ok(
  $$ select public.register_company(tests.payload('carrier', 'ESH010101AB1')) $$,
  '23505', null, 'a taken RFC is refused'
);
insert into tests.vals
select 'carrier_company', public.register_company(tests.payload('carrier', 'MCA010101AB1', '{"contactPhone": null, "contactName": null}'));
select results_eq(
  $$ select c.type::text, c.is_owner_operator, c.contact_name, c.contact_phone,
            (select count(*) from public.business_units b where b.company_id = c.id and b.name = 'Principal'),
            (select count(*) from public.operators o where o.company_id = c.id)
     from public.companies c where c.id = tests.val('carrier_company') $$,
  $$ values ('carrier', false, 'Prueba manager', '+528110000002', 1::bigint, 0::bigint) $$,
  'a manager registers a carrier company with "Principal", no operator row, and the contact defaults to the person'
);

-- A hombre-camión (D13): persona física, their own operator row.
select tests.login('a3100000-0000-4000-8000-000000000003');
insert into tests.vals
select 'owner_company', public.register_company(
  tests.payload('owner_operator', 'GODE561231GR8', '{"legalRepresentativeName": null, "legalName": "Ernesto Gómez Díaz"}')
);
select results_eq(
  $$ select c.type::text, c.is_owner_operator, c.legal_representative_name, o.profile_id, o.full_name, o.phone, o.email,
            b.name
     from public.companies c
     join public.operators o on o.company_id = c.id
     join public.business_units b on b.id = o.business_unit_id
     where c.id = tests.val('owner_company') $$,
  $$ values ('carrier', true, null::text, 'a3100000-0000-4000-8000-000000000003'::uuid, 'Prueba manager', '+528110000003',
             'a3100000-0000-4000-8000-000000000003@g2.test', 'Principal') $$,
  'a hombre-camión gets a carrier company marked is_owner_operator and an operator row of their own in "Principal"'
);
select is(public.auth_operator_id(), (select id from public.operators where profile_id = 'a3100000-0000-4000-8000-000000000003'),
  'the hombre-camión is an operator too');
select is(public.auth_is_manager(), true, 'and still the manager');
select is(
  public.company_missing_fields(tests.val('owner_company')), '{}'::text[],
  'a persona física needs no legal representative'
);

-- Other roles.
select tests.login('a3100000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.register_company(tests.payload('carrier', 'COO010101AB1')) $$,
  '42501', 'role coordinator cannot register a company', 'a coordinator cannot register a company'
);
select tests.login('a3100000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.register_company(tests.payload('carrier', 'OPE010101AB1')) $$,
  '42501', 'role operator cannot register a company', 'an operator cannot register a company'
);
select tests.login('a3100000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'ADM010101AB1')) $$,
  '42501', 'role admin cannot register a company', 'an admin cannot register a company'
);

-- create_company (older builds) still works and leaves the fiscal data missing.
select tests.login('a3100000-0000-4000-8000-000000000010');
insert into tests.vals select 'legacy_company', public.create_company('Fletes Viejos SA de CV', 'FVI010101AB1');
select is(
  public.company_missing_fields(tests.val('legacy_company')),
  array['fiscal_street', 'fiscal_exterior_number', 'fiscal_neighborhood', 'fiscal_postal_code',
        'fiscal_municipality', 'fiscal_state', 'legal_representative_name'],
  'create_company leaves every fiscal field missing'
);
select lives_ok(
  $$ update public.companies
     set fiscal_street = 'Av. Juárez', fiscal_exterior_number = '12', fiscal_neighborhood = 'Centro',
         fiscal_postal_code = '64000', fiscal_municipality = 'Monterrey', fiscal_state = 'Nuevo León',
         legal_representative_name = 'Rosa Viejo'
     where id = tests.val('legacy_company') $$,
  'the manager completes the fiscal data while in review'
);
select is(public.company_missing_fields(tests.val('legacy_company')), '{}'::text[], 'and nothing is missing then');
select throws_ok(
  $$ update public.companies set fiscal_state = 'Texas' where id = tests.val('legacy_company') $$,
  '23514', null, 'the state column only accepts the 32 states'
);

reset role;

-- ---------------------------------------------------------------------------
-- review_company: no approval without the fiscal data
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3100000-0000-4000-8000-000000000006');
select throws_like(
  $$ select public.review_company(tests.val('shipper_company'), 'approve') $$,
  'company is missing required documents: %',
  'a complete registration is only held back by its documents'
);
reset role;
update public.companies set legal_representative_name = null, fiscal_postal_code = null
where id = tests.val('shipper_company');
set local role authenticated;
select throws_ok(
  $$ select public.review_company(tests.val('shipper_company'), 'approve') $$,
  '55000', 'company is missing fiscal data: fiscal_postal_code, legal_representative_name',
  'the admin cannot approve a company with fiscal data missing'
);
select lives_ok(
  $$ select public.review_company(tests.val('shipper_company'), 'reject', 'Faltan datos') $$,
  'rejecting does not need the fiscal data'
);
reset role;

-- The fiscal data is frozen once the company is approved (like legal_name).
update public.companies set status = 'approved' where id = tests.val('legacy_company');
set local role authenticated;
select tests.login('a3100000-0000-4000-8000-000000000010');
select throws_ok(
  $$ update public.companies set fiscal_street = 'Otra calle' where id = tests.val('legacy_company') $$,
  '42501', 'the verified data of an approved company cannot be changed',
  'an approved company keeps its verified fiscal data'
);
select lives_ok(
  $$ update public.companies set contact_name = 'Otro contacto' where id = tests.val('legacy_company') $$,
  'the contact can still change'
);
reset role;

-- ---------------------------------------------------------------------------
-- Invitation links for an operator row registered without an account (G1b
-- links, G2 extension). Carrier 02: units "Principal" (renamed A) and B;
-- coordinator 08 runs B; operator rows: Q (A, no account), P (B, no
-- account), O (A, account 05).
-- ---------------------------------------------------------------------------
update public.business_units set name = 'Unidad A' where company_id = tests.val('carrier_company');
insert into tests.vals select 'bu_a', id from public.business_units where company_id = tests.val('carrier_company');
insert into public.business_units (id, company_id, name)
values ('b3100000-0000-4000-8000-00000000000b', tests.val('carrier_company'), 'Unidad B');
insert into tests.vals values ('bu_b', 'b3100000-0000-4000-8000-00000000000b');
update public.profiles set company_id = tests.val('carrier_company')
where id in ('a3100000-0000-4000-8000-000000000005', 'a3100000-0000-4000-8000-000000000008');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
values (tests.val('bu_b'), tests.val('carrier_company'), 'a3100000-0000-4000-8000-000000000008');
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, email) values
  ('d3100000-0000-4000-8000-00000000000a', tests.val('carrier_company'), tests.val('bu_a'), null, 'Quique Registrado', 'quique@g2.test'),
  ('d3100000-0000-4000-8000-00000000000b', tests.val('carrier_company'), tests.val('bu_b'), null, 'Pablo Registrado', null),
  ('d3100000-0000-4000-8000-00000000000c', tests.val('carrier_company'), tests.val('bu_a'),
   'a3100000-0000-4000-8000-000000000005', 'Omar Con Cuenta', null);

set local role authenticated;
select tests.login('a3100000-0000-4000-8000-000000000002');
insert into tests.tokens
select 'link_q', token from public.create_invitation('operator', '{}', 'd3100000-0000-4000-8000-00000000000a');
select results_eq(
  $$ select kind::text, business_unit_ids, operator_id, invitee_name, accepted_at from public.invitations
     where operator_id = 'd3100000-0000-4000-8000-00000000000a' $$,
  $$ values ('operator', array[tests.val('bu_a')], 'd3100000-0000-4000-8000-00000000000a'::uuid, 'Quique Registrado', null::timestamptz) $$,
  'the manager links an invitation to a registered operator: its business unit and name come from the row'
);
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_b')], 'd3100000-0000-4000-8000-00000000000a') $$,
  '22023', 'the business unit must be the operator''s', 'the link cannot name another business unit'
);
select throws_ok(
  $$ select public.create_invitation('operator', '{}', 'd3100000-0000-4000-8000-00000000000c') $$,
  '22023', 'operator already has an account', 'an operator with an account is not invited again'
);
insert into tests.tokens
select 'link_q2', token from public.create_invitation('operator', '{}', 'd3100000-0000-4000-8000-00000000000a');
select is(
  (select count(*)::int from public.invitations
   where operator_id = 'd3100000-0000-4000-8000-00000000000a' and revoked_at is not null),
  1, 're-issuing revokes the previous pending link of the same operator'
);

select tests.login('a3100000-0000-4000-8000-000000000008');
select throws_ok(
  $$ select public.create_invitation('operator', '{}', 'd3100000-0000-4000-8000-00000000000a') $$,
  '42501', 'operator not found', 'the coordinator of unit B cannot invite the operator of unit A'
);
insert into tests.tokens
select 'link_p', token from public.create_invitation('operator', '{}', 'd3100000-0000-4000-8000-00000000000b');
select ok(tests.token('link_p') ~ '^[A-Za-z0-9_-]{43}$', 'the coordinator invites the registered operator of their unit');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select results_eq(
  $$ select kind::text, business_unit_names, invitee_name from public.invitation_preview(tests.token('link_q2')) $$,
  $$ values ('operator', array['Unidad A'], 'Quique Registrado') $$,
  'the preview of a link to a registered operator shows the row''s name'
);
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('link_q')) $$,
  '22023', 'invalid or expired invitation', 'the superseded link previews as invalid'
);
reset role;

set local role service_role;
select tests.login_service();
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('link_q2'), 'a3100000-0000-4000-8000-000000000009', 'Dani', '12', null) $$,
  '22023', 'invalid phone', 'the redemption refuses junk for a phone'
);
select results_eq(
  $$ select operator_id, profile_id, kind::text from public.redeem_operator_invitation_service(
       tests.token('link_q2'), 'a3100000-0000-4000-8000-000000000009', 'Quique Nuevo', '81 2000 0009', 'Quique@Nuevo.MX') $$,
  $$ values ('d3100000-0000-4000-8000-00000000000a'::uuid, 'a3100000-0000-4000-8000-000000000009'::uuid, 'operator') $$,
  'the service role redeems the link and gets the registered operator row'
);
select results_eq(
  $$ select o.profile_id, o.full_name, o.email, o.phone, p.company_id, p.phone,
            (select count(*) from public.operators where company_id = tests.val('carrier_company'))
     from public.operators o join public.profiles p on p.id = 'a3100000-0000-4000-8000-000000000009'
     where o.id = 'd3100000-0000-4000-8000-00000000000a' $$,
  $$ values ('a3100000-0000-4000-8000-000000000009'::uuid, 'Quique Registrado', 'quique@g2.test', '+528120000009',
             tests.val('carrier_company'), '+528110000009', 3::bigint) $$,
  'the row is linked to the account (keeping its name and email, taking the phone) and no row is added'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('link_q2'), 'a3100000-0000-4000-8000-000000000009', 'Otro', null, null) $$,
  '22023', 'invalid or expired invitation', 'the link is single use'
);
reset role;

-- A link whose row got an account by other means is no longer valid.
update public.operators set profile_id = null where id = 'd3100000-0000-4000-8000-00000000000a';
update public.profiles set company_id = null where id = 'a3100000-0000-4000-8000-000000000009';
update public.operators set profile_id = 'a3100000-0000-4000-8000-000000000009', business_unit_id = tests.val('bu_b')
where id = 'd3100000-0000-4000-8000-00000000000b';
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('link_p')) $$,
  '22023', 'invalid or expired invitation', 'a link to a row that got an account since previews as invalid'
);
reset role;
set local role service_role;
select tests.login_service();
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('link_p'), 'a3100000-0000-4000-8000-000000000009', 'X', null, null) $$,
  '42501', 'user already belongs to a company', 'and cannot be redeemed by that account'
);

-- ---------------------------------------------------------------------------
-- revoke_user_sessions_service (after an access reset)
-- ---------------------------------------------------------------------------
reset role;
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('e3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000005', now(), now()),
       ('e3100000-0000-4000-8000-000000000002', 'a3100000-0000-4000-8000-000000000005', now(), now()),
       ('e3100000-0000-4000-8000-000000000003', 'a3100000-0000-4000-8000-000000000002', now(), now());
insert into auth.refresh_tokens (token, user_id, session_id, created_at, updated_at)
values ('g2-token-1', 'a3100000-0000-4000-8000-000000000005', 'e3100000-0000-4000-8000-000000000001', now(), now()),
       ('g2-token-3', 'a3100000-0000-4000-8000-000000000002', 'e3100000-0000-4000-8000-000000000003', now(), now());
set local role service_role;
select is(
  public.revoke_user_sessions_service('a3100000-0000-4000-8000-000000000005'), 2,
  'the service role ends every session of the operator'
);
reset role;
select results_eq(
  $$ select (select count(*) from auth.sessions where user_id = 'a3100000-0000-4000-8000-000000000005'),
            (select count(*) from auth.refresh_tokens where user_id = 'a3100000-0000-4000-8000-000000000005'),
            (select count(*) from auth.sessions where user_id = 'a3100000-0000-4000-8000-000000000002'),
            (select count(*) from auth.refresh_tokens where user_id = 'a3100000-0000-4000-8000-000000000002') $$,
  $$ values (0::bigint, 0::bigint, 1::bigint, 1::bigint) $$,
  'only that user''s sessions and refresh tokens are gone'
);
set local role service_role;
select throws_ok(
  $$ select public.revoke_user_sessions_service('a3100000-0000-4000-8000-0000000000ee') $$,
  '22023', 'user not found', 'an unknown user is refused'
);
reset role;
set local role authenticated;
select tests.login('a3100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.revoke_user_sessions_service('a3100000-0000-4000-8000-000000000005') $$,
  '42501', null, 'a user cannot end sessions'
);
reset role;
set local role service_role;
select tests.login_service();

-- ---------------------------------------------------------------------------
-- discard_unredeemed_operator_service (compensation of redeem-invitation)
-- ---------------------------------------------------------------------------
reset role;
select tests.new_user('a3100000-0000-4000-8000-0000000000f7', 'operator', '8119990007',
                      '{"provisioned_by": "redeem-invitation"}');
set local role service_role;
select is(
  public.discard_unredeemed_operator_service('a3100000-0000-4000-8000-000000000009'), false,
  'an operator account already linked by its redemption is kept'
);
select is(
  public.discard_unredeemed_operator_service('a3100000-0000-4000-8000-000000000002'), false,
  'only operator accounts are discarded'
);
select is(
  public.discard_unredeemed_operator_service('a3100000-0000-4000-8000-0000000000f7'), true,
  'an operator account that never got linked is discarded'
);
reset role;
select is(
  (select count(*)::int from auth.users where id in ('a3100000-0000-4000-8000-0000000000f7', 'a3100000-0000-4000-8000-000000000009')),
  1, 'the unlinked account is gone and the linked one stays'
);
set local role authenticated;
select tests.login('a3100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.discard_unredeemed_operator_service('a3100000-0000-4000-8000-000000000009') $$,
  '42501', null, 'a user cannot discard accounts'
);
reset role;
set local role service_role;
select tests.login_service();

-- ---------------------------------------------------------------------------
-- Rate limits of redeem-invitation (service buckets)
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select public.consume_service_rate_limit('redeem-invitation-token', 'h') > 0 from generate_series(1, 6) g order by g $$,
  $$ select g > 5 from generate_series(1, 6) g order by g $$,
  'a token can be tried 5 times per window'
);
select is(public.consume_service_rate_limit('redeem-invitation-ip', 'ip-hash'), 0, 'an address has its own bucket');
reset role;
set local role authenticated;
select tests.login('a3100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.consume_rate_limit('redeem-invitation-ip') $$,
  '22023', null, 'the buckets of the Edge Function are not for users'
);
reset role;

-- ---------------------------------------------------------------------------
-- Retired: the operator invitation codes of B04
-- ---------------------------------------------------------------------------
select hasnt_function('public', 'create_operator_invitation', 'create_operator_invitation is gone');
select hasnt_function('public', 'accept_operator_invitation', 'accept_operator_invitation is gone');
select hasnt_function('public', 'revoke_operator_invitation', 'revoke_operator_invitation is gone');
select has_table('public', 'operator_invitations', 'operator_invitations stays as history');
select is(
  (select count(*)::int from public.operator_invitations where accepted_at is null and revoked_at is null),
  0, 'no operator invitation code is pending'
);

select * from finish();
rollback;
