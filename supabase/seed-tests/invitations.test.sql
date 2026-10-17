-- G1b · Invitation links on the demo seed (acceptance of plan §G G1b): Jorge
-- (manager of Transportes Regios del Norte) invites a coordinator and the
-- anonymous preview names the company; Andrea and Héctor (coordinators) only
-- invite into their own business units; a guessed token reveals nothing.
--
--   supabase test db supabase/seed-tests
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to anon, authenticated, service_role;
create function tests.token(p_name text)
returns text
language sql
stable
as $$ select token from tests.tokens where name = p_name $$;

create table tests.vals (name text primary key, id uuid);
grant select on tests.vals to authenticated;
insert into tests.vals
select 'corredor', id from public.business_units
where company_id = '5eed0002-0000-4000-8000-000000000004' and name = 'Corredor MTY–GDL';
insert into tests.vals
select 'regional', id from public.business_units
where company_id = '5eed0002-0000-4000-8000-000000000004' and name = 'Regional Monterrey';
create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Jorge Villarreal, manager of Transportes Regios del Norte.
set local role authenticated;
select tests.login('5eed0001-0000-4000-8000-000000000005');
insert into tests.tokens
select 'coordinator', token
from public.create_invitation('coordinator', array[tests.val('corredor'), tests.val('regional')], null, 'Nueva Coordinadora');
select ok(tests.token('coordinator') ~ '^[A-Za-z0-9_-]{43}$', 'Jorge creates a coordinator invitation');
insert into tests.tokens
select 'reset_pedro', token
from public.create_invitation('operator_access_reset', '{}', '5eed0003-0000-4000-8000-000000000001');
select ok(tests.token('reset_pedro') ~ '^[A-Za-z0-9_-]{43}$', 'Jorge resets the access of Pedro López');
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', '5eed0003-0000-4000-8000-000000000003') $$,
  '22023', 'operator has no account', 'Arturo Cantú has no account to reset'
);

-- Andrea Cavazos, coordinator of "Corredor MTY–GDL".
select tests.login('5eed0001-0000-4000-8000-000000000011');
insert into tests.tokens
select 'operator_corredor', token from public.create_invitation('operator', array[tests.val('corredor')], null, 'Operador Nuevo');
select ok(tests.token('operator_corredor') ~ '^[A-Za-z0-9_-]{43}$', 'Andrea invites an operator into her business unit');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('regional')]) $$,
  '42501', 'business unit not found', 'Andrea cannot invite into "Regional Monterrey"'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('corredor')]) $$,
  '42501', 'only the manager invites coordinators', 'Andrea cannot invite coordinators'
);

-- Héctor Ibarra, coordinator of "Regional Monterrey".
select tests.login('5eed0001-0000-4000-8000-000000000012');
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', '5eed0003-0000-4000-8000-000000000001') $$,
  '42501', 'operator not found', 'Héctor cannot reset the access of an operator of the corredor'
);
select is(
  (select count(*)::int from public.invitations), 0, 'Héctor sees no invitation of the corredor'
);
select tests.login('5eed0001-0000-4000-8000-000000000011');
select is(
  (select count(*)::int from public.invitations), 2,
  'Andrea sees the operator invitation and the access reset of her business unit, not the coordinator one'
);
select tests.login('5eed0001-0000-4000-8000-000000000005');
select is(
  (select count(*)::int from public.invitations), 3, 'Jorge sees the three invitations'
);
reset role;

-- The anonymous preview.
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select results_eq(
  $$ select kind::text, company_legal_name, business_unit_names, inviter_name, invitee_name
     from public.invitation_preview(tests.token('coordinator')) $$,
  $$ values ('coordinator', 'Transportes Regios del Norte, S.A. de C.V.', array['Corredor MTY–GDL', 'Regional Monterrey'],
             'Jorge Villarreal', 'Nueva Coordinadora') $$,
  'the anonymous preview of the coordinator invitation names the company and its business units'
);
select results_eq(
  $$ select kind::text, business_unit_names, inviter_name from public.invitation_preview(tests.token('operator_corredor')) $$,
  $$ values ('operator', array['Corredor MTY–GDL'], 'Andrea Cavazos') $$,
  'the preview of the operator invitation'
);
select throws_ok(
  $$ select * from public.invitation_preview(rpad('adivinado', 43, 'x')) $$,
  '22023', 'invalid or expired invitation', 'a guessed token reveals nothing'
);
select throws_ok(
  $$ select * from public.invitations $$,
  '42501', null, 'anon cannot read invitations'
);
reset role;

-- The Edge Function of G2 (service role) redeems Pedro's access reset.
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select results_eq(
  $$ select operator_id, profile_id, kind::text from public.redeem_operator_invitation_service(tests.token('reset_pedro'), null) $$,
  $$ values ('5eed0003-0000-4000-8000-000000000001'::uuid, '5eed0001-0000-4000-8000-000000000008'::uuid, 'operator_access_reset') $$,
  'the service role redeems the reset and gets Pedro''s profile'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('reset_pedro'), null) $$,
  '22023', 'invalid or expired invitation', 'the reset link is single use'
);
reset role;

select * from finish();
rollback;
