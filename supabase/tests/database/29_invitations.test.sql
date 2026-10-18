-- G1b · Invitations by link (D15-E1, D19):
--   * who invites whom: only the manager invites coordinators; the manager
--     or a coordinator of the business unit invites operators or resets an
--     operator's access, never for another business unit, never an account
--     that is not an operator's;
--   * the token: 43 base64url characters, returned once, never readable;
--   * the read matrix of invitations (manager, coordinators, operator,
--     another carrier, shipper, admin) and the revocation;
--   * the anonymous preview: what it shows and that unknown, malformed,
--     expired, used and revoked tokens fail the same way;
--   * accepting as coordinator and redeeming as the service role (new
--     operator and access reset), single use;
--   * the rate limit of create_invitation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(114);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.new_user(p_id uuid, p_role text, p_confirmed boolean default true)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g1b.test',
          case when p_confirmed then now() end, case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end, jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
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
grant select on tests.vals to anon, authenticated, service_role;
create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- Tokens returned by create_invitation, kept across role switches.
create table tests.tokens (name text primary key, token text not null);
grant select, insert on tests.tokens to anon, authenticated, service_role;
create function tests.token(p_name text)
returns text
language sql
stable
as $$ select token from tests.tokens where name = p_name $$;

-- How many invitations p_uid sees.
create function tests.sees(p_uid uuid)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  select count(*) into v_count from public.invitations;
  execute 'reset role';
  return v_count;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a29…: 01 S shipper, 02 M manager, 03 A coordinator of unit
-- A, 04 B coordinator of unit B, 05 O operator of unit A (with account),
-- 06 X manager of another carrier (an owner-operator), 07 C coordinator
-- without a company, 08 C2 coordinator with an unconfirmed email, 09 D new
-- operator account, 10 N coordinator without business units, 11 admin,
-- 12 D2 another new operator account.
-- ---------------------------------------------------------------------------
select tests.new_user('a2900000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a2900000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a2900000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a2900000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a2900000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a2900000-0000-4000-8000-000000000006', 'manager');
select tests.new_user('a2900000-0000-4000-8000-000000000007', 'coordinator');
select tests.new_user('a2900000-0000-4000-8000-000000000008', 'coordinator', false);
select tests.new_user('a2900000-0000-4000-8000-000000000009', 'operator');
select tests.new_user('a2900000-0000-4000-8000-000000000010', 'coordinator');
select tests.new_user('a2900000-0000-4000-8000-000000000011', 'shipper');
select tests.new_user('a2900000-0000-4000-8000-000000000012', 'operator');
update public.profiles set role = 'admin' where id = 'a2900000-0000-4000-8000-000000000011';
update public.profiles set full_name = 'Marta Gerente' where id = 'a2900000-0000-4000-8000-000000000002';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c2900000-0000-4000-8000-000000000001', 'shipper', 'Envíos Uno SA de CV', 'EUN050505GH5', 'approved'),
  ('c2900000-0000-4000-8000-000000000002', 'carrier', 'Fletes Dos SA de CV', 'FDO040404CD4', 'approved'),
  ('c2900000-0000-4000-8000-000000000003', 'carrier', 'Fletes Tres SA de CV', 'FTR040404CD4', 'approved');
update public.companies set is_owner_operator = true where id = 'c2900000-0000-4000-8000-000000000003';
update public.profiles set company_id = 'c2900000-0000-4000-8000-000000000001'
where id = 'a2900000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c2900000-0000-4000-8000-000000000002'
where id in ('a2900000-0000-4000-8000-000000000002', 'a2900000-0000-4000-8000-000000000003',
             'a2900000-0000-4000-8000-000000000004', 'a2900000-0000-4000-8000-000000000005',
             'a2900000-0000-4000-8000-000000000010');
update public.profiles set company_id = 'c2900000-0000-4000-8000-000000000003'
where id = 'a2900000-0000-4000-8000-000000000006';

update public.business_units set name = 'Unidad A' where company_id = 'c2900000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c2900000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b2900000-0000-4000-8000-00000000000b', 'c2900000-0000-4000-8000-000000000002', 'Unidad B'),
       ('b2900000-0000-4000-8000-00000000000c', 'c2900000-0000-4000-8000-000000000002', 'Unidad C (baja)'),
       ('b2900000-0000-4000-8000-00000000000d', 'c2900000-0000-4000-8000-000000000002', 'Unidad D');
update public.business_units set archived_at = now() where id = 'b2900000-0000-4000-8000-00000000000c';
insert into tests.vals values ('bu_b', 'b2900000-0000-4000-8000-00000000000b'),
                              ('bu_c', 'b2900000-0000-4000-8000-00000000000c'),
                              ('bu_d', 'b2900000-0000-4000-8000-00000000000d');
insert into tests.vals select 'bu_x', id from public.business_units where company_id = 'c2900000-0000-4000-8000-000000000003';

insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c2900000-0000-4000-8000-000000000002', 'a2900000-0000-4000-8000-000000000003'),
  (tests.val('bu_b'), 'c2900000-0000-4000-8000-000000000002', 'a2900000-0000-4000-8000-000000000004');

-- Operators: O (unit A, account 05), Q (unit A, no account), P (unit B, no
-- account), R (unit A, archived), and the owner-operator's own row in company 3.
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name) values
  ('d2900000-0000-4000-8000-000000000005', 'c2900000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a2900000-0000-4000-8000-000000000005', 'Omar Operador'),
  ('d2900000-0000-4000-8000-00000000000a', 'c2900000-0000-4000-8000-000000000002', tests.val('bu_a'), null, 'Quique'),
  ('d2900000-0000-4000-8000-00000000000b', 'c2900000-0000-4000-8000-000000000002', tests.val('bu_b'), null, 'Pablo'),
  ('d2900000-0000-4000-8000-00000000000c', 'c2900000-0000-4000-8000-000000000002', tests.val('bu_a'), null, 'Raúl'),
  ('d2900000-0000-4000-8000-000000000006', 'c2900000-0000-4000-8000-000000000003', tests.val('bu_x'),
   'a2900000-0000-4000-8000-000000000006', 'Xavier Hombre Camión');
update public.operators set archived_at = now() where id = 'd2900000-0000-4000-8000-00000000000c';

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------
select enum_has_labels('public', 'invitation_kind', array['coordinator', 'operator', 'operator_access_reset'],
  'invitation_kind labels');
select ok(
  not has_table_privilege('authenticated', 'public.invitations', 'insert, update, delete')
  and not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'select')
  and has_column_privilege('authenticated', 'public.invitations', 'kind', 'select')
  and not has_table_privilege('anon', 'public.invitations', 'select'),
  'clients only read invitations, and never the token hash'
);
select ok(
  has_function_privilege('anon', 'public.invitation_preview(text)', 'execute')
  and has_function_privilege('authenticated', 'public.invitation_preview(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.redeem_operator_invitation_service(text, uuid, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_invitation(public.invitation_kind, uuid[], uuid, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.accept_coordinator_invitation(text)', 'execute'),
  'the preview is public; redeeming is for the service role; the rest for signed-in users'
);

-- ---------------------------------------------------------------------------
-- create_invitation: the manager
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000002');

insert into tests.tokens
select 'coord_ab', token from public.create_invitation('coordinator', array[tests.val('bu_a'), tests.val('bu_b'), tests.val('bu_a')],
                                                       null, 'Carla Coordinadora');
select ok(tests.token('coord_ab') ~ '^[A-Za-z0-9_-]{43}$', 'the token is 43 base64url characters (32 random bytes)');
select is(
  (select business_unit_ids from public.invitations i join tests.tokens t on t.name = 'coord_ab'
   where i.kind = 'coordinator' and i.invitee_name = 'Carla Coordinadora'),
  (select array_agg(u order by u) from unnest(array[tests.val('bu_a'), tests.val('bu_b')]) u),
  'a coordinator invitation keeps its business units once, without repeats'
);
select ok(
  (select expires_at between now() + interval '167 hours' and now() + interval '169 hours'
   from public.invitations where invitee_name = 'Carla Coordinadora'),
  'an invitation lasts 7 days by default'
);
select throws_ok(
  $$ select token_hash from public.invitations $$,
  '42501', null, 'clients cannot read token hashes'
);
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at)
     values ('c2900000-0000-4000-8000-000000000002', 'coordinator', array[tests.val('bu_a')], '\x00', now() + interval '1 day') $$,
  '42501', null, 'invitations are created only through the RPC'
);

insert into tests.tokens
select 'coord_d', token from public.create_invitation('coordinator', array[tests.val('bu_d')], null, null, 1);
select ok(
  (select expires_at between now() + interval '59 minutes' and now() + interval '61 minutes'
   from public.invitations where kind = 'coordinator' and invitee_name is null),
  'the lifetime is configurable in hours'
);

insert into tests.tokens
select 'op_a_m', token from public.create_invitation('operator', array[tests.val('bu_a')], null, 'Nuevo Operador');
insert into tests.tokens
select 'op_a_noname', token from public.create_invitation('operator', array[tests.val('bu_a')]);
insert into tests.tokens
select 'reset_o_m', token from public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-000000000005');
select is(
  (select business_unit_ids from public.invitations where kind = 'operator_access_reset'),
  array[tests.val('bu_a')],
  'an access reset takes the business unit of the operator when none is given'
);

-- Validation.
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('bu_a')], null, null, 0) $$,
  '22023', 'p_valid_for_hours must be between 1 and 720', 'the lifetime is bounded below'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('bu_a')], null, null, 721) $$,
  '22023', 'p_valid_for_hours must be between 1 and 720', 'the lifetime is bounded above'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', '{}') $$,
  '22023', 'at least one business unit is required', 'a coordinator invitation needs a business unit'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', array[null::uuid]) $$,
  '22023', 'at least one business unit is required', 'a null business unit does not count'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('bu_a')], 'd2900000-0000-4000-8000-000000000005') $$,
  '22023', 'p_operator_id is not for coordinator invitations', 'a coordinator invitation has no operator'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('bu_c')]) $$,
  '42501', 'business unit not found', 'an archived business unit cannot be assigned'
);
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('bu_x')]) $$,
  '42501', 'business unit not found', 'a business unit of another company cannot be assigned'
);
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_a'), tests.val('bu_b')]) $$,
  '22023', 'exactly one business unit is required', 'an operator invitation has one business unit'
);
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_b')], 'd2900000-0000-4000-8000-00000000000a') $$,
  '22023', 'the business unit must be the operator''s',
  'an operator invitation that names a row (G2) is for that row''s business unit'
);
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_c')]) $$,
  '42501', 'business unit not found', 'an operator cannot be invited into an archived business unit'
);
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}') $$,
  '22023', 'p_operator_id is required', 'an access reset names the operator'
);
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', array[tests.val('bu_b')], 'd2900000-0000-4000-8000-000000000005') $$,
  '22023', 'the business unit must be the operator''s', 'an access reset is for the operator''s business unit'
);
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-00000000000a') $$,
  '22023', 'operator has no account', 'an operator without an account has no access to reset'
);
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-00000000000c') $$,
  '22023', 'operator is archived', 'an archived operator cannot be reset'
);
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-000000000006') $$,
  '42501', 'operator not found', 'an operator of another company cannot be reset'
);
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_a')], null, repeat('x', 201)) $$,
  '22023', 'p_invitee_name is too long', 'the invitee name is bounded'
);

-- Re-issuing a reset revokes the pending one of the same operator.
insert into tests.tokens
select 'reset_o_m2', token from public.create_invitation('operator_access_reset', array[tests.val('bu_a')],
                                                         'd2900000-0000-4000-8000-000000000005');
select results_eq(
  $$ select revoked_at is not null from public.invitations where kind = 'operator_access_reset' order by created_at $$,
  $$ values (true), (false) $$,
  're-issuing an access reset revokes the pending one of the same operator'
);

-- ---------------------------------------------------------------------------
-- create_invitation: coordinators and everyone else
-- ---------------------------------------------------------------------------
select tests.login('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('bu_a')]) $$,
  '42501', 'only the manager invites coordinators', 'a coordinator cannot invite coordinators'
);
insert into tests.tokens
select 'op_a_a', token from public.create_invitation('operator', array[tests.val('bu_a')]);
select ok(tests.token('op_a_a') ~ '^[A-Za-z0-9_-]{43}$', 'a coordinator invites an operator into their business unit');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_b')]) $$,
  '42501', 'business unit not found', 'a coordinator cannot invite an operator into another business unit'
);
insert into tests.tokens
select 'reset_o_a', token from public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-000000000005');
select ok(tests.token('reset_o_a') ~ '^[A-Za-z0-9_-]{43}$', 'a coordinator resets the access of an operator of their business unit');
select is(
  (select count(*)::int from public.invitations where kind = 'operator_access_reset' and revoked_at is null),
  1, 'the coordinator''s reset superseded the manager''s'
);

select tests.login('a2900000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-000000000005') $$,
  '42501', 'operator not found', 'the coordinator of another business unit cannot reset an operator'
);
insert into tests.tokens
select 'op_b_b', token from public.create_invitation('operator', array[tests.val('bu_b')]);

select tests.login('a2900000-0000-4000-8000-000000000010');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_a')]) $$,
  '42501', 'business unit not found', 'a coordinator without business units invites nobody'
);

select tests.login('a2900000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.create_invitation('coordinator', array[tests.val('bu_a')]) $$,
  '42501', 'business unit not found', 'the manager of another company cannot assign these business units'
);
select throws_ok(
  $$ select public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-000000000006') $$,
  '42501', 'only an operator account can be reset', 'an owner-operator''s manager account is never reset by a link'
);

select tests.login('a2900000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_a')]) $$,
  '42501', 'only the staff of a carrier company can invite', 'a shipper cannot invite'
);
select tests.login('a2900000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_a')]) $$,
  '42501', 'only the staff of a carrier company can invite', 'an operator cannot invite'
);
select tests.login('a2900000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.create_invitation('operator', array[tests.val('bu_a')]) $$,
  '42501', 'only the staff of a carrier company can invite', 'a coordinator without a company cannot invite'
);
reset role;

-- ---------------------------------------------------------------------------
-- Read matrix. Company 2 has: coord_ab, coord_d (coordinator); op_a_m,
-- op_a_noname, op_a_a, reset_o_m (revoked), reset_o_m2 (revoked), reset_o_a
-- (unit A); op_b_b (unit B).
-- ---------------------------------------------------------------------------
-- The demo links of the seed (G2) are left out, so the file passes with and without it.
select is((select count(*) from public.invitations where company_id::text not like '5eed%'), 9::bigint,
          'nine invitations exist');
select is(tests.sees('a2900000-0000-4000-8000-000000000002'), 9::bigint, 'the manager sees every invitation of the company');
select is(tests.sees('a2900000-0000-4000-8000-000000000003'), 6::bigint,
  'coordinator A sees the operator invitations and resets of unit A, not the coordinator ones');
select is(tests.sees('a2900000-0000-4000-8000-000000000004'), 1::bigint, 'coordinator B sees only unit B''s');
select is(tests.sees('a2900000-0000-4000-8000-000000000010'), 0::bigint, 'a coordinator without business units sees none');
select is(tests.sees('a2900000-0000-4000-8000-000000000005'), 0::bigint, 'an operator sees none');
select is(tests.sees('a2900000-0000-4000-8000-000000000006'), 0::bigint, 'another carrier sees none');
select is(tests.sees('a2900000-0000-4000-8000-000000000001'), 0::bigint, 'a shipper sees none');
select is(tests.sees('a2900000-0000-4000-8000-000000000007'), 0::bigint, 'a coordinator without a company sees none');
select is(tests.sees('a2900000-0000-4000-8000-000000000011'),
          (select count(*) from public.invitations), 'the admin sees all');

-- ---------------------------------------------------------------------------
-- revoke_invitation
-- ---------------------------------------------------------------------------
insert into tests.vals select 'inv_coord_d', id from public.invitations
where token_hash = sha256(convert_to(tests.token('coord_d'), 'UTF8'));
insert into tests.vals select 'inv_op_a_a', id from public.invitations
where token_hash = sha256(convert_to(tests.token('op_a_a'), 'UTF8'));
insert into tests.vals select 'inv_op_b_b', id from public.invitations
where token_hash = sha256(convert_to(tests.token('op_b_b'), 'UTF8'));
insert into tests.vals select 'inv_op_a_m', id from public.invitations
where token_hash = sha256(convert_to(tests.token('op_a_m'), 'UTF8'));

set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.revoke_invitation(tests.val('inv_coord_d')) $$,
  '42501', 'invitation not found', 'a coordinator cannot revoke a coordinator invitation'
);
select throws_ok(
  $$ select public.revoke_invitation(tests.val('inv_op_b_b')) $$,
  '42501', 'invitation not found', 'a coordinator cannot revoke an invitation of another business unit'
);
select lives_ok(
  $$ select public.revoke_invitation(tests.val('inv_op_a_a')) $$,
  'a coordinator revokes an operator invitation of their business unit'
);
select throws_ok(
  $$ select public.revoke_invitation(tests.val('inv_op_a_a')) $$,
  '22023', 'invitation is no longer pending', 'a revoked invitation cannot be revoked again'
);
select tests.login('a2900000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.revoke_invitation(tests.val('inv_coord_d')) $$,
  '42501', 'invitation not found', 'another carrier cannot revoke'
);
select tests.login('a2900000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.revoke_invitation(tests.val('inv_coord_d')) $$,
  'the manager revokes a coordinator invitation'
);
reset role;

-- ---------------------------------------------------------------------------
-- invitation_preview (anonymous)
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select results_eq(
  $$ select kind::text, company_legal_name, business_unit_names, inviter_name, invitee_name
     from public.invitation_preview(tests.token('coord_ab')) $$,
  $$ values ('coordinator', 'Fletes Dos SA de CV', array['Unidad A', 'Unidad B'], 'Marta Gerente', 'Carla Coordinadora') $$,
  'anyone with the link sees the kind, the company, the business units, who invites and whom'
);
select results_eq(
  $$ select kind::text, business_unit_names, invitee_name from public.invitation_preview(tests.token('op_a_m')) $$,
  $$ values ('operator', array['Unidad A'], 'Nuevo Operador') $$,
  'the preview of an operator invitation'
);
select results_eq(
  $$ select kind::text, business_unit_names from public.invitation_preview(tests.token('reset_o_a')) $$,
  $$ values ('operator_access_reset', array['Unidad A']) $$,
  'the preview of an access reset'
);
select throws_ok(
  $$ select * from public.invitation_preview(repeat('A', 43)) $$,
  '22023', 'invalid or expired invitation', 'a guessed token reveals nothing'
);
select throws_ok(
  $$ select * from public.invitation_preview(left(tests.token('coord_ab'), 42)) $$,
  '22023', 'invalid or expired invitation', 'a truncated token fails the same way'
);
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('coord_ab') || '=') $$,
  '22023', 'invalid or expired invitation', 'a malformed token fails the same way'
);
select throws_ok(
  $$ select * from public.invitation_preview(null) $$,
  '22023', 'invalid or expired invitation', 'a null token fails the same way'
);
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('coord_d')) $$,
  '22023', 'invalid or expired invitation', 'a revoked invitation fails the same way'
);
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('reset_o_m')) $$,
  '22023', 'invalid or expired invitation', 'a superseded reset fails the same way'
);
select throws_ok(
  $$ select * from public.invitations $$,
  '42501', null, 'anon still cannot read the table'
);
reset role;

-- Expired: as the owner, move the expiry of op_b_b to the past.
update public.invitations set expires_at = now() - interval '1 second'
where token_hash = sha256(convert_to(tests.token('op_b_b'), 'UTF8'));
set local role anon;
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('op_b_b')) $$,
  '22023', 'invalid or expired invitation', 'an expired invitation fails the same way'
);
reset role;

-- A coordinator invitation whose business units were all archived.
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000002');
insert into tests.tokens
select 'coord_d_archived', token from public.create_invitation('coordinator', array[tests.val('bu_d')]);
insert into tests.tokens
select 'coord_ad', token from public.create_invitation('coordinator', array[tests.val('bu_a'), tests.val('bu_d')]);
reset role;
update public.business_units set archived_at = now() where id = tests.val('bu_d');
set local role anon;
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('coord_d_archived')) $$,
  '22023', 'invalid or expired invitation', 'an invitation to archived business units only fails the same way'
);
select is(
  (select business_unit_names from public.invitation_preview(tests.token('coord_ad'))),
  array['Unidad A'],
  'the preview lists only the business units still active'
);
reset role;

-- ---------------------------------------------------------------------------
-- accept_coordinator_invitation
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_ab')) $$,
  '42501', 'only coordinator accounts can accept this invitation', 'a shipper cannot accept a coordinator invitation'
);
select tests.login('a2900000-0000-4000-8000-000000000009');
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_ab')) $$,
  '42501', 'only coordinator accounts can accept this invitation', 'an operator account cannot accept it'
);
select tests.login('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_ab')) $$,
  '42501', 'user already belongs to a company', 'a coordinator who already has a company cannot accept'
);
select tests.login('a2900000-0000-4000-8000-000000000008');
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_ab')) $$,
  '42501', 'email not confirmed', 'an unconfirmed email cannot accept'
);
select tests.login('a2900000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.accept_coordinator_invitation(repeat('A', 43)) $$,
  '22023', 'invalid or expired invitation', 'a guessed token is not accepted'
);
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_d')) $$,
  '22023', 'invalid or expired invitation', 'a revoked invitation is not accepted'
);
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('op_a_m')) $$,
  '22023', 'invalid or expired invitation', 'an operator link is not a coordinator invitation'
);
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_d_archived')) $$,
  '22023', 'invalid or expired invitation', 'an invitation to archived business units only is not accepted'
);
select is(
  public.accept_coordinator_invitation(tests.token('coord_ab')),
  'c2900000-0000-4000-8000-000000000002'::uuid,
  'a coordinator without a company accepts the invitation'
);
select is(
  (select company_id from public.profiles where id = 'a2900000-0000-4000-8000-000000000007'),
  'c2900000-0000-4000-8000-000000000002'::uuid,
  'the coordinator now belongs to the company'
);
select is(
  public.auth_business_unit_ids(),
  (select array_agg(u order by u) from unnest(array[tests.val('bu_a'), tests.val('bu_b')]) u),
  'and runs the business units of the invitation'
);
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_ab')) $$,
  '42501', 'user already belongs to a company', 'the same account cannot accept again'
);
reset role;
select is(
  (select accepted_by from public.invitations where token_hash = sha256(convert_to(tests.token('coord_ab'), 'UTF8'))),
  'a2900000-0000-4000-8000-000000000007'::uuid,
  'the invitation records who accepted it'
);
set local role anon;
select throws_ok(
  $$ select * from public.invitation_preview(tests.token('coord_ab')) $$,
  '22023', 'invalid or expired invitation', 'a used invitation fails the same way in the preview'
);
reset role;

-- A second coordinator with the same token: single use. (A fresh coordinator
-- account; the concurrent case is in 30_invitations_concurrency.)
select tests.new_user('a2900000-0000-4000-8000-000000000013', 'coordinator');
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000013');
select throws_ok(
  $$ select public.accept_coordinator_invitation(tests.token('coord_ab')) $$,
  '22023', 'invalid or expired invitation', 'a used invitation cannot be accepted by anyone else'
);
-- Archived business units are skipped at acceptance.
select is(public.accept_coordinator_invitation(tests.token('coord_ad')), 'c2900000-0000-4000-8000-000000000002'::uuid,
  'an invitation with one archived business unit is still accepted');
select is(public.auth_business_unit_ids(), array[tests.val('bu_a')], 'only the active business unit is assigned');
reset role;

-- ---------------------------------------------------------------------------
-- redeem_operator_invitation_service
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_m'), 'a2900000-0000-4000-8000-000000000009', 'Dani', null, null) $$,
  '42501', null, 'a signed-in user cannot call the service redemption'
);
reset role;

set local role service_role;
-- The grant alone is not enough: the JWT must be the service role's.
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_m'), 'a2900000-0000-4000-8000-000000000009', 'Dani', null, null) $$,
  '42501', 'service role required', 'the service redemption checks the JWT role claim'
);
select tests.login_service();

select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(repeat('A', 43), 'a2900000-0000-4000-8000-000000000009', 'Dani', null, null) $$,
  '22023', 'invalid or expired invitation', 'a guessed token is not redeemed'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('coord_ab'), 'a2900000-0000-4000-8000-000000000009', 'Dani', null, null) $$,
  '22023', 'invalid or expired invitation', 'a coordinator link is not redeemed as operator'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_a'), 'a2900000-0000-4000-8000-000000000009', 'Dani', null, null) $$,
  '22023', 'invalid or expired invitation', 'a revoked operator link is not redeemed'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_b_b'), 'a2900000-0000-4000-8000-000000000009', 'Dani', null, null) $$,
  '22023', 'invalid or expired invitation', 'an expired operator link is not redeemed'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_m'), null, 'Dani', null, null) $$,
  '22023', 'p_user_id is required', 'a new operator needs the account the Edge Function created'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_m'), 'a2900000-0000-4000-8000-000000000001', 'Dani', null, null) $$,
  '42501', 'only operator accounts can redeem this invitation', 'a shipper account cannot become an operator'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_m'), 'a2900000-0000-4000-8000-000000000005', 'Dani', null, null) $$,
  '42501', 'user already belongs to a company', 'an operator who already has a company cannot redeem'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_noname'), 'a2900000-0000-4000-8000-000000000009', null, null, null) $$,
  '22023', 'p_full_name is required', 'a new operator needs a name when the link has none'
);
select results_eq(
  $$ select profile_id, kind::text from public.redeem_operator_invitation_service(
       tests.token('op_a_m'), 'a2900000-0000-4000-8000-000000000009', ' Dani Nuevo ', '+52 81 1234 5678', 'Dani@Example.com') $$,
  $$ values ('a2900000-0000-4000-8000-000000000009'::uuid, 'operator') $$,
  'a new operator account redeems the link'
);
select results_eq(
  $$ select o.business_unit_id, o.full_name, o.phone, o.email, p.company_id, p.full_name, p.phone
     from public.operators o join public.profiles p on p.id = o.profile_id
     where o.profile_id = 'a2900000-0000-4000-8000-000000000009' $$,
  $$ select tests.val('bu_a'), 'Dani Nuevo', '+528112345678', 'dani@example.com',
            'c2900000-0000-4000-8000-000000000002'::uuid, 'Dani Nuevo', '+525500000000' $$,
  'the operator row is created in the business unit, linked to the account, and the profile joins the company'
);
select is(
  (select operator_id from public.invitations where token_hash = sha256(convert_to(tests.token('op_a_m'), 'UTF8'))),
  (select id from public.operators where profile_id = 'a2900000-0000-4000-8000-000000000009'),
  'the invitation records the operator it created'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('op_a_m'), 'a2900000-0000-4000-8000-000000000012', 'Otro', null, null) $$,
  '22023', 'invalid or expired invitation', 'a redeemed operator link is single use'
);

-- Access reset.
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('reset_o_a'), 'a2900000-0000-4000-8000-000000000012', null, null, null) $$,
  '22023', 'p_user_id is not for an access reset', 'an access reset never takes a user'
);
select results_eq(
  $$ select operator_id, profile_id, kind::text from public.redeem_operator_invitation_service(tests.token('reset_o_a'), null) $$,
  $$ values ('d2900000-0000-4000-8000-000000000005'::uuid, 'a2900000-0000-4000-8000-000000000005'::uuid, 'operator_access_reset') $$,
  'an access reset returns the operator''s profile to set the password for'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('reset_o_a'), null) $$,
  '22023', 'invalid or expired invitation', 'a second redemption of the same reset fails'
);
select is(
  (select profile_id from public.operators where id = 'd2900000-0000-4000-8000-000000000005'),
  'a2900000-0000-4000-8000-000000000005'::uuid,
  'a reset changes nothing about who the operator is'
);
reset role;

-- A reset whose operator lost the account before it was redeemed, and one
-- whose account is not an operator's (forced as the owner: the RPC refuses
-- to create it).
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000002');
insert into tests.tokens
select 'reset_o_late', token from public.create_invitation('operator_access_reset', '{}', 'd2900000-0000-4000-8000-000000000005');
reset role;
update public.operators set profile_id = null where id = 'd2900000-0000-4000-8000-000000000005';
insert into public.invitations (company_id, kind, business_unit_ids, operator_id, token_hash, expires_at)
values ('c2900000-0000-4000-8000-000000000003', 'operator_access_reset', array[tests.val('bu_x')],
        'd2900000-0000-4000-8000-000000000006', sha256(convert_to(repeat('B', 43), 'UTF8')), now() + interval '1 day');
set local role service_role;
select tests.login_service();
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(tests.token('reset_o_late'), null) $$,
  '22023', 'invalid or expired invitation', 'a reset for an operator who lost the account is not redeemed'
);
select throws_ok(
  $$ select * from public.redeem_operator_invitation_service(repeat('B', 43), null) $$,
  '22023', 'invalid or expired invitation', 'a reset for a manager''s account is never redeemed'
);
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.invitation_preview(repeat('B', 43)) $$,
  '22023', 'invalid or expired invitation', 'nor previewed'
);
reset role;

-- ---------------------------------------------------------------------------
-- Shape of the rows (the owner, as the seed would write them)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at)
     values ('c2900000-0000-4000-8000-000000000002', 'coordinator', array[tests.val('bu_x')],
             sha256(convert_to(repeat('C', 43), 'UTF8')), now() + interval '1 day') $$,
  '23514', 'business units must belong to the company', 'business units of another company are refused'
);
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at)
     values ('c2900000-0000-4000-8000-000000000002', 'coordinator', array[tests.val('bu_a'), tests.val('bu_a')],
             sha256(convert_to(repeat('C', 43), 'UTF8')), now() + interval '1 day') $$,
  '23514', 'business_unit_ids cannot repeat', 'repeated business units are refused'
);
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at)
     values ('c2900000-0000-4000-8000-000000000002', 'operator', array[tests.val('bu_a'), tests.val('bu_b')],
             sha256(convert_to(repeat('C', 43), 'UTF8')), now() + interval '1 day') $$,
  '23514', null, 'an operator invitation with two business units is refused'
);
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, operator_id, token_hash, expires_at)
     values ('c2900000-0000-4000-8000-000000000002', 'operator_access_reset', array[tests.val('bu_b')],
             'd2900000-0000-4000-8000-00000000000a', sha256(convert_to(repeat('C', 43), 'UTF8')), now() + interval '1 day') $$,
  '23514', 'operator must belong to the business unit', 'a reset names the operator''s business unit'
);
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at)
     values ('c2900000-0000-4000-8000-000000000002', 'operator_access_reset', array[tests.val('bu_a')],
             sha256(convert_to(repeat('C', 43), 'UTF8')), now() + interval '1 day') $$,
  '23514', null, 'a reset without an operator is refused'
);
select throws_ok(
  $$ insert into public.invitations (company_id, kind, business_unit_ids, token_hash, expires_at, accepted_at, revoked_at)
     values ('c2900000-0000-4000-8000-000000000002', 'coordinator', array[tests.val('bu_a')],
             sha256(convert_to(repeat('C', 43), 'UTF8')), now() + interval '1 day', now(), now()) $$,
  '23514', null, 'an invitation has a single outcome'
);

-- ---------------------------------------------------------------------------
-- Rate limit: 20 invitations per user and minute (the manager of company 3,
-- who has created none yet). Start far from a minute boundary so every call
-- lands in the same window.
-- ---------------------------------------------------------------------------
do $$
begin
  if extract(second from clock_timestamp()) >= 40 then
    perform pg_sleep(61 - extract(second from clock_timestamp())::float8);
  end if;
end;
$$;
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000006');
select is(
  (select count(*) from generate_series(1, 20) g,
     lateral public.create_invitation('operator', array[tests.val('bu_x')], null, 'Operador ' || g)),
  20::bigint,
  'the first 20 invitations in a minute are created'
);
select throws_ok(
  $$ select * from public.create_invitation('operator', array[tests.val('bu_x')]) $$,
  'PT429', 'rate limit exceeded', 'the 21st is refused with the seconds until the window resets'
);
reset role;

select * from finish();
rollback;
