-- S1 · Base del acceso (plan-acceso.md §S1):
--   * D51: review_company leaves company_approved / company_rejected to the
--     staff of the company (never to its operators, to other companies nor
--     to the admin who decided), with the reason of a rejection; a
--     suspension and a failed decision leave nothing;
--   * D50-5: register_company answers a repeated RFC with 23505 and the
--     detail `rfc_taken`, only to a signed-in account without a company;
--   * D50-2: invitations.invitee_phone: who may set it (create_invitation),
--     how it is normalized, what invitation_preview returns and to whom, and
--     that it never reaches another company.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_role text, p_phone text default '+52 81 1234 5678')
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@s1.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', p_phone, 'full_name', 'Prueba ' || p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

create function tests.logout()
returns void
language sql
as $$ select set_config('request.jwt.claims', '{"role": "anon"}', true); $$;

create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to anon, authenticated;
create function tests.token(p_name text)
returns text
language sql
stable
as $$ select token from tests.tokens where name = p_name $$;

-- A complete registration payload.
create function tests.payload(p_kind text, p_rfc text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'kind', p_kind, 'legalName', 'Empresa ' || p_rfc, 'rfc', p_rfc,
    'fiscalStreet', 'Av. Constitución', 'fiscalExteriorNumber', '400', 'fiscalNeighborhood', 'Centro',
    'fiscalPostalCode', '64000', 'fiscalMunicipality', 'Monterrey', 'fiscalState', 'Nuevo León',
    'legalRepresentativeName', 'Ana Pérez'
  );
$$;

-- Every required company document, approved (what the admin reviews first).
create function tests.approve_documents(p_company_id uuid)
returns void
language sql
as $$
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select p_company_id, m.id, 'company', p_company_id,
         p_company_id || '/company/' || p_company_id || '/' || gen_random_uuid() || '.pdf',
         'approved', now() + interval '1 year'
  from public.company_missing_requirements(p_company_id) m;
$$;

-- The notifications of a user about the review of the company.
create function tests.notices(p_user uuid)
returns table (type text, data jsonb)
language sql
stable
as $$
  select n.type::text, n.data from public.notifications n
  where n.user_id = p_user and n.type in ('company_approved', 'company_rejected')
  order by n.type::text;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Users a70…: 01 shipper Sara, 02 manager Mario, 03 coordinator Carla, 04 operator Omar (all of Fletes S1, but
-- Sara: Envíos S1), 05 admin, 06 manager Xavier (other carrier), 07 shipper without a company, 08 admin (second).
select tests.new_user('a7000000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a7000000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a7000000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a7000000-0000-4000-8000-000000000004', 'operator');
select tests.new_user('a7000000-0000-4000-8000-000000000005', 'shipper');
select tests.new_user('a7000000-0000-4000-8000-000000000006', 'manager');
select tests.new_user('a7000000-0000-4000-8000-000000000007', 'shipper');
select tests.new_user('a7000000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin'
where id in ('a7000000-0000-4000-8000-000000000005', 'a7000000-0000-4000-8000-000000000008');

-- The companies are registered through the RPC, as the apps do.
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000001');
select public.register_company(tests.payload('shipper', 'ESU050505GH5'));
select tests.login('a7000000-0000-4000-8000-000000000002');
select public.register_company(tests.payload('carrier', 'FSU040404CD4'));
select tests.login('a7000000-0000-4000-8000-000000000006');
select public.register_company(tests.payload('carrier', 'TEQ030303EF3'));
reset role;

-- Definer: the ids are fixtures, whoever is signed in.
create function tests.company(p_rfc text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select id from public.companies where rfc = p_rfc $$;
create function tests.unit(p_rfc text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select id from public.business_units where company_id = tests.company(p_rfc) and archived_at is null $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Carla coordinates the unit of Fletes S1; Omar drives for it.
update public.profiles set company_id = tests.company('FSU040404CD4')
where id in ('a7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000004');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
values (tests.unit('FSU040404CD4'), tests.company('FSU040404CD4'), 'a7000000-0000-4000-8000-000000000003');
insert into public.operators (id, company_id, profile_id, full_name, phone) values
  ('d7000000-0000-4000-8000-000000000004', tests.company('FSU040404CD4'), 'a7000000-0000-4000-8000-000000000004',
   'Omar Operador', '+528100000004'),
  ('d7000000-0000-4000-8000-000000000009', tests.company('FSU040404CD4'), null, 'Pedro Sin Cuenta', '81 5555 0009'),
  ('d7000000-0000-4000-8000-00000000000a', tests.company('FSU040404CD4'), null, 'Quique Sin Teléfono', null);

-- The counts below are of this test's decisions only, whatever the database
-- already holds (rolled back with the transaction).
delete from public.notifications where type in ('company_approved', 'company_rejected');

select tests.approve_documents(tests.company('FSU040404CD4'));
select tests.approve_documents(tests.company('ESU050505GH5'));

-- ---------------------------------------------------------------------------
-- D51 · review_company notifies the company
-- ---------------------------------------------------------------------------
select ok(
  'company_approved' = any (enum_range(null::public.notification_type)::text[])
  and 'company_rejected' = any (enum_range(null::public.notification_type)::text[]),
  'the notification types of the company review exist'
);

-- A decision that fails leaves nothing.
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.review_company(tests.company('TEQ030303EF3'), 'approve') $$,
  '55000', null, 'a company without its documents is not approved'
);
select throws_ok(
  $$ select public.review_company(tests.company('FSU040404CD4'), 'reject') $$,
  '22023', 'a rejection needs a reason', 'a rejection still needs its reason'
);
reset role;
select is(
  (select count(*)::int from public.notifications where type in ('company_approved', 'company_rejected')),
  0, 'a decision that fails notifies nobody'
);

-- Only an admin decides (unchanged): nobody approves their own company.
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.review_company(tests.company('FSU040404CD4'), 'approve') $$,
  '42501', 'only admins can review companies', 'a manager cannot approve their own company'
);
select tests.login('a7000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.review_company(tests.company('FSU040404CD4'), 'approve') $$,
  '42501', 'only admins can review companies', 'an account without a company cannot review one'
);
select tests.logout();
set local role anon;
select throws_ok(
  $$ select public.review_company(tests.company('FSU040404CD4'), 'approve') $$,
  '42501', null, 'anon cannot call review_company'
);
reset role;

-- The carrier is rejected, with the reason.
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000005');
select is(
  public.review_company(tests.company('FSU040404CD4'), 'reject', '  La constancia no coincide con el RFC.  '),
  'rejected'::public.verification_status, 'the admin rejects the carrier'
);
reset role;
select results_eq(
  $$ select type, data from tests.notices('a7000000-0000-4000-8000-000000000002') $$,
  $$ values ('company_rejected', jsonb_build_object(
       'companyId', tests.company('FSU040404CD4'), 'companyName', 'Empresa FSU040404CD4',
       'reason', 'La constancia no coincide con el RFC.')) $$,
  'the manager is told of the rejection, with the reason'
);
select results_eq(
  $$ select type, data ->> 'reason' from tests.notices('a7000000-0000-4000-8000-000000000003') $$,
  $$ values ('company_rejected', 'La constancia no coincide con el RFC.') $$,
  'the coordinator of the company is told too'
);
select is_empty(
  $$ select * from tests.notices('a7000000-0000-4000-8000-000000000004') $$,
  'the operator is not told: the review of the company is not theirs'
);
select is_empty(
  $$ select n.user_id from public.notifications n
     where n.type in ('company_approved', 'company_rejected')
       and n.user_id not in ('a7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000003') $$,
  'nobody else is told: not the admin, not another company, not an account without one'
);

-- The staff asks for a new review and the admin approves.
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000002');
select public.request_company_review();
select tests.login('a7000000-0000-4000-8000-000000000005');
select is(
  public.review_company(tests.company('FSU040404CD4'), 'approve'),
  'approved'::public.verification_status, 'the admin approves the carrier'
);
select is(
  public.review_company(tests.company('ESU050505GH5'), 'approve', 'Todo en orden'),
  'approved'::public.verification_status, 'the admin approves the shipper'
);
reset role;
select results_eq(
  $$ select type, data from tests.notices('a7000000-0000-4000-8000-000000000002') $$,
  $$ values ('company_approved', jsonb_build_object(
               'companyId', tests.company('FSU040404CD4'), 'companyName', 'Empresa FSU040404CD4')),
            ('company_rejected', jsonb_build_object(
               'companyId', tests.company('FSU040404CD4'), 'companyName', 'Empresa FSU040404CD4',
               'reason', 'La constancia no coincide con el RFC.')) $$,
  'the manager is told of the approval; an approval carries no reason'
);
select results_eq(
  $$ select type, data from tests.notices('a7000000-0000-4000-8000-000000000001') $$,
  $$ values ('company_approved', jsonb_build_object(
       'companyId', tests.company('ESU050505GH5'), 'companyName', 'Empresa ESU050505GH5')) $$,
  'the shipper is told of the approval of their own company only, without the admin''s internal note'
);

-- A suspension has no notice (D51 covers the approval and the rejection).
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000005');
select public.review_company(tests.company('ESU050505GH5'), 'suspend', 'Adeudo');
reset role;
select is(
  (select count(*)::int from tests.notices('a7000000-0000-4000-8000-000000000001')),
  1, 'a suspension leaves no company notice'
);

-- The notices are private: RLS shows each user their own.
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000006');
select is(
  (select count(*)::int from public.notifications where type in ('company_approved', 'company_rejected')),
  0, 'another carrier reads none of them'
);
select tests.login('a7000000-0000-4000-8000-000000000003');
select is(
  (select count(*)::int from public.notifications where type in ('company_approved', 'company_rejected')),
  2, 'the coordinator reads their own two'
);
reset role;

-- An admin who belongs to the company they review is not told of their own decision.
update public.profiles set role = 'manager', company_id = tests.company('TEQ030303EF3')
where id = 'a7000000-0000-4000-8000-000000000008';
select tests.approve_documents(tests.company('TEQ030303EF3'));
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000005');
select public.review_company(tests.company('TEQ030303EF3'), 'approve');
reset role;
select results_eq(
  $$ select n.user_id from public.notifications n
     where n.type = 'company_approved' and n.data ->> 'companyId' = tests.company('TEQ030303EF3')::text
     order by n.user_id $$,
  $$ values ('a7000000-0000-4000-8000-000000000006'::uuid), ('a7000000-0000-4000-8000-000000000008'::uuid) $$,
  'every manager of the company is told'
);

-- ---------------------------------------------------------------------------
-- D50-5 · register_company: a repeated RFC
-- ---------------------------------------------------------------------------
create function tests.register_error(p_payload jsonb)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_message text;
  v_detail text;
begin
  perform public.register_company(p_payload);
  return 'registered';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
  return v_state || '|' || v_message || '|' || v_detail;
end;
$$;
grant execute on function tests.register_error(jsonb) to anon, authenticated;

set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000007');
select is(
  tests.register_error(tests.payload('shipper', 'FSU040404CD4')),
  '23505|rfc already registered (companies_rfc_key)|rfc_taken',
  'a repeated RFC raises 23505 with the detail rfc_taken (and the constraint name older builds read)'
);
select is(
  tests.register_error(tests.payload('shipper', 'fsu-040404 cd4')),
  '23505|rfc already registered (companies_rfc_key)|rfc_taken',
  'the RFC is compared as it is stored: without spaces or dashes, in upper case'
);
select is(
  (select company_id from public.profiles where id = 'a7000000-0000-4000-8000-000000000007'),
  null, 'the account is left without a company: it can fix the RFC and try again'
);
select lives_ok(
  $$ select public.register_company(tests.payload('shipper', 'NUE060606IJ6')) $$,
  'with a free RFC the same account registers its company'
);
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'FSU040404CD4')) $$,
  '42501', 'user already belongs to a company',
  'an account with a company learns nothing about another RFC'
);
select tests.logout();
set local role anon;
select throws_ok(
  $$ select public.register_company(tests.payload('shipper', 'FSU040404CD4')) $$,
  '42501', null, 'anon cannot ask whether an RFC is registered'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.register_company(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.register_company(jsonb)', 'execute'),
  'register_company keeps its grants'
);

-- ---------------------------------------------------------------------------
-- D50-2 · The phone of an invited operator
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated',
    'public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer, text)', 'execute')
  and not has_function_privilege('anon',
    'public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer, text)', 'execute')
  and has_function_privilege('anon', 'public.invitation_preview(text)', 'execute')
  and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('create_invitation', 'invitation_preview')) = 2,
  'create_invitation and invitation_preview keep their grants and have a single signature each'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('create_invitation', 'invitation_preview', 'review_company', 'register_company')),
  'the recreated functions are security definer with a fixed search_path'
);

set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000002');
insert into tests.tokens
select 'with_phone', token
from public.create_invitation('operator', array[tests.unit('FSU040404CD4')], null, 'Nuevo Operador', 168, '81 2222 3333');
insert into tests.tokens
select 'without_phone', token from public.create_invitation('operator', array[tests.unit('FSU040404CD4')], null, 'Otro Operador');
insert into tests.tokens
select 'row_phone', token from public.create_invitation('operator', '{}', 'd7000000-0000-4000-8000-000000000009');
insert into tests.tokens
select 'row_no_phone', token from public.create_invitation('operator', '{}', 'd7000000-0000-4000-8000-00000000000a');
insert into tests.tokens
select 'row_typed', token
from public.create_invitation('operator', '{}', 'd7000000-0000-4000-8000-000000000009', null, 168, '+52 1 81 7777 8888');
insert into tests.tokens
select 'coordinator', token from public.create_invitation('coordinator', array[tests.unit('FSU040404CD4')], null, 'Coordinadora');
insert into tests.tokens
select 'blank_phone', token
from public.create_invitation('operator', array[tests.unit('FSU040404CD4')], null, 'Sin Teléfono', 168, '   ');

select throws_ok(
  $$ select public.create_invitation('operator', array[tests.unit('FSU040404CD4')], null, 'Malo', 168, '12345') $$,
  '22023', 'invalid p_invitee_phone', 'a phone that is not one is refused'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.unit('FSU040404CD4')], null, 'Coord', 168, '8122223333') $$,
  '22023', 'p_invitee_phone is only for operator invitations', 'a coordinator link carries no phone'
);
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', 'd7000000-0000-4000-8000-000000000004', null, 168, '8122223333') $$,
  '22023', 'p_invitee_phone is only for operator invitations', 'an access reset link carries no phone'
);
-- The authorization of create_invitation is unchanged by the new parameter.
select tests.login('a7000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.unit('FSU040404CD4')], null, 'Intruso', 168, '8122223333') $$,
  '42501', 'business unit not found', 'another carrier cannot invite into this company, with or without a phone'
);
select tests.login('a7000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.unit('FSU040404CD4')], null, 'Intruso', 168, '8122223333') $$,
  '42501', 'only the staff of a carrier company can invite', 'a shipper cannot invite'
);
select tests.login('a7000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.unit('FSU040404CD4')], null, 'Intruso', 168, '8122223333') $$,
  '42501', null, 'an operator cannot invite'
);
reset role;

select results_eq(
  $$ select i.invitee_name, i.invitee_phone from public.invitations i
     where i.company_id = tests.company('FSU040404CD4') and i.revoked_at is null
     order by i.invitee_name $$,
  $$ values ('Coordinadora', null), ('Nuevo Operador', '+528122223333'), ('Otro Operador', null),
            ('Pedro Sin Cuenta', '+528177778888'), ('Quique Sin Teléfono', null), ('Sin Teléfono', null) $$,
  'the phone is stored in E.164; without one it stays empty; a re-issued link replaces the previous one'
);
select throws_ok(
  $$ update public.invitations set invitee_phone = '81 2222 3333' where invitee_name = 'Otro Operador' $$,
  '23514', null, 'the column only takes E.164'
);
select throws_ok(
  $$ update public.invitations set invitee_phone = '+528122223333' where invitee_name = 'Coordinadora' $$,
  '23514', null, 'the column only takes a phone on an operator link'
);

-- The preview: for whoever holds the token (anon included), nothing more.
select tests.logout();
set local role anon;
select results_eq(
  $$ select kind::text, invitee_name, invitee_phone from public.invitation_preview(tests.token('with_phone')) $$,
  $$ values ('operator', 'Nuevo Operador', '+528122223333') $$,
  'the preview returns the name and the phone typed by whoever invited'
);
select results_eq(
  $$ select invitee_name, invitee_phone from public.invitation_preview(tests.token('without_phone')) $$,
  $$ values ('Otro Operador', null::text) $$,
  'a link without a phone previews without one'
);
select results_eq(
  $$ select invitee_name, invitee_phone from public.invitation_preview(tests.token('row_typed')) $$,
  $$ values ('Pedro Sin Cuenta', '+528177778888') $$,
  'a link for an operator row takes the phone typed now over the one on the row'
);
select results_eq(
  $$ select invitee_name, invitee_phone from public.invitation_preview(tests.token('row_no_phone')) $$,
  $$ values ('Quique Sin Teléfono', null::text) $$,
  'a row without a phone previews without one'
);
select results_eq(
  $$ select kind::text, invitee_phone from public.invitation_preview(tests.token('coordinator')) $$,
  $$ values ('coordinator', null::text) $$,
  'a coordinator link never returns a phone'
);
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('row_phone')) $$,
  '22023', 'invalid or expired invitation',
  'the link the re-issue replaced (with the phone of the row) no longer opens'
);
select throws_ok(
  $$ select * from public.invitation_preview(rpad('adivinado', 43, 'x')) $$,
  '22023', 'invalid or expired invitation', 'a guessed token returns nothing, as before'
);
reset role;

-- The table stays closed: anon has no privilege and another company reads
-- nothing. The phone has no column grant either: not even the staff that
-- typed it reads it back from the table; it leaves only through
-- invitation_preview, with the token.
select ok(
  not has_column_privilege('authenticated', 'public.invitations', 'invitee_phone', 'select')
  and not has_column_privilege('anon', 'public.invitations', 'invitee_phone', 'select')
  and not has_column_privilege('authenticated', 'public.invitations', 'invitee_phone', 'update')
  and has_column_privilege('authenticated', 'public.invitations', 'invitee_name', 'select'),
  'no client role reads or writes invitations.invitee_phone directly'
);
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select invitee_phone from public.invitations $$,
  '42501', null, 'the manager who invited cannot select the phone from the table'
);
reset role;
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000006');
select is(
  (select count(*)::int from public.invitations where company_id = tests.company('FSU040404CD4')),
  0, 'another carrier reads no invitation (nor its phone) of this company'
);
reset role;

select * from finish();
rollback;
