-- Notification dispatch and crons (B09): who may call the dispatcher RPCs,
-- claim/record (lease, per-channel marks, fencing, backoff, give up), invalid
-- push tokens, load expiry, document expiry warnings (once per threshold) and
-- the stale-location reminder.
begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, service_role;

create function tests.new_user(p_id uuid, p_email text, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email, now(), jsonb_build_object('role', p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create table tests.vals (name text primary key, id uuid);

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- A load GDL -> MTY published by the caller, pickup from +4 h to +30 h.
create function tests.publish(p_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  v_id := public.create_load(jsonb_build_object(
    'origin', '{"address": "Av. Vallarta 1", "city": "Guadalajara", "state": "Jalisco", "lat": 20.656, "lng": -103.391}'::jsonb,
    'destination', '{"address": "Av. Constitución 1", "city": "Monterrey", "state": "Nuevo León", "lat": 25.724, "lng": -100.201}'::jsonb,
    'pickupWindow', jsonb_build_object('start', now() + interval '4 hours', 'end', now() + interval '30 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '30 hours', 'end', now() + interval '36 hours'),
    'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 18000, 'volumeM3', 60,
    'unitType', 'dry_van', 'specialRequirements', '[]'::jsonb, 'proposedPriceCents', 3900000
  ));
  perform public.publish_load(v_id);
  insert into tests.vals values (p_name, v_id);
  return v_id;
end;
$$;

-- Pending (not yet dispatched) notifications of a user, by type.
create function tests.pending(p_user uuid, p_type text)
returns integer
language sql
as $$
  select count(*)::integer from public.notifications
  where user_id = p_user and type::text = p_type and dispatched_at is null;
$$;

grant execute on all functions in schema tests to authenticated, service_role;
grant select, insert on tests.vals to authenticated, service_role;

-- Users: ...01 shipper S  ...02 carrier A  ...05 operator O of A
select tests.new_user('a9000000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a9000000-0000-4000-8000-000000000002', 'ana@a.test', 'carrier');
select tests.new_user('a9000000-0000-4000-8000-000000000005', 'oscar@a.test', 'operator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c9000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c9000000-0000-4000-8000-000000000002', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved');

update public.profiles p set company_id = c.id
from (values
  ('a9000000-0000-4000-8000-000000000001'::uuid, 'c9000000-0000-4000-8000-000000000001'::uuid),
  ('a9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000002'),
  ('a9000000-0000-4000-8000-000000000005', 'c9000000-0000-4000-8000-000000000002')
) as c(uid, id)
where p.id = c.uid;

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d9000000-0000-4000-8000-000000000005', 'c9000000-0000-4000-8000-000000000002',
   'a9000000-0000-4000-8000-000000000005', 'Óscar Operador');

insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg, capacity_m3) values
  ('e9000000-0000-4000-8000-0000000000a1', 'c9000000-0000-4000-8000-000000000002', 'trailer', 'AAA1111', 'dry_van', 30000, 100);

insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.id = 'e9000000-0000-4000-8000-0000000000a1'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- Schema: new label, notices table locked down, schedules
-- ---------------------------------------------------------------------------
select ok(
  'trip_location_stale' = any (enum_range(null::public.notification_type)::text[]),
  'notification_type has trip_location_stale'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.document_expiry_notices'::regclass),
  'document_expiry_notices has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.document_expiry_notices', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.document_expiry_notices', 'select,insert,update,delete'),
  'clients have no privileges on document_expiry_notices'
);
select results_eq(
  $$ select jobname::text, schedule::text from cron.job
     where jobname in ('dispatch-notifications', 'expire-stale-loads', 'process-document-expiry',
                       'remind-stale-trip-locations')
     order by jobname $$,
  $$ values ('dispatch-notifications', '* * * * *'), ('expire-stale-loads', '*/15 * * * *'),
            ('process-document-expiry', '0 13 * * *'), ('remind-stale-trip-locations', '*/10 * * * *') $$,
  'the four cron jobs are scheduled'
);

-- Who may call what.
select ok(
  has_function_privilege('service_role', 'public.claim_notifications(integer, integer)', 'execute')
  and has_function_privilege('service_role', 'public.record_notification_dispatch(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.delete_push_tokens(text[])', 'execute'),
  'the service role runs the dispatcher RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_notifications(integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_notification_dispatch(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.delete_push_tokens(text[])', 'execute'),
  'users cannot claim, record or delete tokens'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.expire_stale_loads()', 'public.process_document_expiry(integer[])',
      'public.remind_stale_trip_locations(interval)', 'public.invoke_notification_dispatcher()'
    ]::regprocedure[]) f
    where has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute')
  ),
  'the cron functions are only run by pg_cron'
);

set local role authenticated;
select tests.login('a9000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.claim_notifications() $$, '42501', null, 'a user cannot claim notifications'
);
select throws_ok(
  $$ select public.expire_stale_loads() $$, '42501', null, 'a user cannot run a cron function'
);
reset role;

-- ---------------------------------------------------------------------------
-- Claim and record
-- ---------------------------------------------------------------------------
-- Start from an empty queue (the fixtures above queued nothing yet).
update public.notifications set dispatched_at = now() where dispatched_at is null;

insert into public.push_tokens (user_id, token, platform) values
  ('a9000000-0000-4000-8000-000000000002', 'ExponentPushToken[aaaaaaaaaaaa]', 'android'),
  ('a9000000-0000-4000-8000-000000000002', 'ExponentPushToken[bbbbbbbbbbbb]', 'ios');

insert into public.notifications (id, user_id, type, data, created_at) values
  ('f9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'offer_received', '{}', now() - interval '2 minutes'),
  ('f9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000002', 'load_match', '{}', now() - interval '1 minute'),
  ('f9000000-0000-4000-8000-000000000003', 'a9000000-0000-4000-8000-000000000002', 'load_match', '{}', now() - interval '2 days');

set local role service_role;
select results_eq(
  $$ select id, attempt, push_pending, email_pending, email, role::text, cardinality(push_tokens)
     from public.claim_notifications(10, 60) $$,
  $$ values ('f9000000-0000-4000-8000-000000000001'::uuid, 1, true, true, 'sara@s.test'::text, 'shipper'::text, 0),
            ('f9000000-0000-4000-8000-000000000002'::uuid, 1, true, true, 'ana@a.test'::text, 'carrier'::text, 2) $$,
  'claim returns the due notifications, oldest first, with the email, role and devices of the user'
);
select is_empty(
  $$ select * from public.claim_notifications(10, 60) $$,
  'a claimed notification is leased: a second claim does not return it'
);
reset role;
select results_eq(
  $$ select dispatched_at is not null, dispatch_error, dispatch_attempts::int from public.notifications
     where id = 'f9000000-0000-4000-8000-000000000003' $$,
  $$ values (true, 'stale'::text, 0) $$,
  'a notification older than a day is closed as stale instead of pushed'
);
select throws_ok(
  $$ select * from public.claim_notifications(0, 60) $$, '22023', null, 'claim validates the limit'
);

set local role service_role;
select is(
  public.record_notification_dispatch(
    '[{"id": "f9000000-0000-4000-8000-000000000001", "attempt": 1, "pushSent": false, "emailSent": true, "done": true},
      {"id": "f9000000-0000-4000-8000-000000000002", "attempt": 1, "pushSent": true, "emailSent": false, "done": false, "error": "email: HTTP 500"}]'
  ),
  2, 'record updates both claimed notifications'
);
reset role;
select results_eq(
  $$ select dispatched_at is not null, email_sent_at is not null, push_sent_at is not null, dispatch_retry_at is null
     from public.notifications where id = 'f9000000-0000-4000-8000-000000000001' $$,
  $$ values (true, true, false, true) $$,
  'a done notification is closed and keeps its email mark'
);
select results_eq(
  $$ select dispatched_at is null, push_sent_at is not null, dispatch_error,
            dispatch_retry_at between now() + interval '59 seconds' and now() + interval '61 seconds'
     from public.notifications where id = 'f9000000-0000-4000-8000-000000000002' $$,
  $$ values (true, true, 'email: HTTP 500'::text, true) $$,
  'a failed notification keeps its push mark and is retried after 1 minute'
);

-- A late result of an older claim is ignored (fencing by attempt).
set local role service_role;
select is(
  public.record_notification_dispatch(
    '[{"id": "f9000000-0000-4000-8000-000000000001", "attempt": 1, "done": false}]'
  ),
  0, 'a result for a closed notification changes nothing'
);
reset role;
update public.notifications set dispatch_retry_at = now() - interval '1 second'
where id = 'f9000000-0000-4000-8000-000000000002';
set local role service_role;
select results_eq(
  $$ select id, attempt, push_pending, email_pending from public.claim_notifications(10, 60) $$,
  $$ values ('f9000000-0000-4000-8000-000000000002'::uuid, 2, false, true) $$,
  'the retry is claimed again with only the email pending'
);
select is(
  public.record_notification_dispatch('[{"id": "f9000000-0000-4000-8000-000000000002", "attempt": 1, "done": true}]'),
  0, 'a result of a previous attempt is ignored'
);
select is(
  public.record_notification_dispatch('[{"id": "f9000000-0000-4000-8000-000000000002", "attempt": 2, "done": false}]'),
  1, 'the result of the current attempt is recorded'
);
reset role;
select ok(
  (select dispatch_retry_at between now() + interval '239 seconds' and now() + interval '241 seconds'
   from public.notifications where id = 'f9000000-0000-4000-8000-000000000002'),
  'the second retry waits 4 minutes'
);

-- After the fifth attempt the dispatcher gives up.
update public.notifications set dispatch_attempts = 4, dispatch_retry_at = null
where id = 'f9000000-0000-4000-8000-000000000002';
set local role service_role;
select is((select attempt from public.claim_notifications(10, 60)), 5, 'fifth attempt');
select public.record_notification_dispatch(
  '[{"id": "f9000000-0000-4000-8000-000000000002", "attempt": 5, "done": false, "error": "push: RequestFailed"}]'
);
reset role;
select results_eq(
  $$ select dispatched_at is not null, dispatch_error, email_sent_at is null
     from public.notifications where id = 'f9000000-0000-4000-8000-000000000002' $$,
  $$ values (true, 'push: RequestFailed'::text, true) $$,
  'after five failed attempts the notification is closed with its last error'
);
select throws_ok(
  $$ select public.record_notification_dispatch('{}') $$, '22023', null, 'record expects an array'
);

-- Invalid tokens.
set local role service_role;
select is(
  public.delete_push_tokens(array['ExponentPushToken[bbbbbbbbbbbb]', 'ExponentPushToken[zzzzzzzzzzzz]']),
  1, 'delete_push_tokens removes the tokens that exist'
);
reset role;
select is(
  (select array_agg(token) from public.push_tokens where user_id = 'a9000000-0000-4000-8000-000000000002'),
  array['ExponentPushToken[aaaaaaaaaaaa]'], 'the other device of the user stays'
);

-- The cron hook does nothing without its Vault secrets.
select is(public.invoke_notification_dispatcher(), null, 'without Vault secrets the dispatcher is not invoked');

-- ---------------------------------------------------------------------------
-- Cron: expire loads whose pickup window closed
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a9000000-0000-4000-8000-000000000001');
select tests.publish('expired_negotiating');
select tests.publish('expired_published');
select tests.publish('open');
select tests.login('a9000000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer', public.make_offer(tests.val('expired_negotiating'), 3800000);
insert into tests.vals select 'open_offer', public.make_offer(tests.val('open'), 3800000);
reset role;

update public.loads
set pickup_window_start = now() - interval '3 hours', pickup_window_end = now() - interval '1 minute'
where id in (tests.val('expired_negotiating'), tests.val('expired_published'));

select is(public.expire_stale_loads(), 2, 'two loads expire');
select results_eq(
  $$ select v.name, l.status::text from public.loads l join tests.vals v on v.id = l.id
     where v.name in ('expired_negotiating', 'expired_published', 'open') order by v.name $$,
  $$ values ('expired_negotiating', 'expired'), ('expired_published', 'expired'), ('open', 'negotiating') $$,
  'only the loads whose pickup window closed expire'
);
select results_eq(
  $$ select status::text, status_reason, responded_at is not null from public.offers where id = tests.val('offer') $$,
  $$ values ('expired', 'load_expired'::text, true) $$,
  'the pending offer of an expired load expires with it'
);
select is(
  (select status::text from public.offers where id = tests.val('open_offer')), 'pending',
  'offers of open loads are untouched'
);
select is(public.expire_stale_loads(), 0, 'running it again expires nothing');

-- ---------------------------------------------------------------------------
-- Cron: document expiry
-- ---------------------------------------------------------------------------
-- pg_cron runs without a JWT: nobody is the actor of these notifications.
select set_config('request.jwt.claims', '', true);
-- Operator license (owner: O), a company policy expiring in 20 days, a unit
-- document in 3 days and one already expired.
insert into public.documents (id, company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select x.id, 'c9000000-0000-4000-8000-000000000002', r.id, x.owner_type::public.document_owner_type, x.owner_id,
       'c9000000-0000-4000-8000-000000000002/' || x.owner_type || '/' || x.owner_id || '/' || x.id || '.pdf',
       'approved', now() + x.expires_in
from (values
  ('b9000000-0000-4000-8000-000000000001'::uuid, 'carrier_insurance_policy', 'company',
   'c9000000-0000-4000-8000-000000000002'::uuid, interval '20 days'),
  ('b9000000-0000-4000-8000-000000000002', 'federal_driver_license', 'operator',
   'd9000000-0000-4000-8000-000000000005', interval '3 days'),
  ('b9000000-0000-4000-8000-000000000003', 'legal_representative_id', 'company',
   'c9000000-0000-4000-8000-000000000002', interval '-1 hour'),
  ('b9000000-0000-4000-8000-000000000004', 'carrier_insurance_policy', 'company',
   'c9000000-0000-4000-8000-000000000002', interval '90 days')
) as x(id, code, owner_type, owner_id, expires_in)
join public.document_requirements r on r.code = x.code;

select is(public.process_document_expiry(), 2, 'two documents are warned');
select is(
  (select status::text from public.documents where id = 'b9000000-0000-4000-8000-000000000003'), 'expired',
  'an approved document past its expiry is marked expired'
);
select is(
  (select status::text from public.documents where id = 'b9000000-0000-4000-8000-000000000001'), 'approved',
  'a document that is only about to expire stays approved'
);
select results_eq(
  $$ select document_id, threshold_days::int from public.document_expiry_notices order by document_id, threshold_days $$,
  $$ values ('b9000000-0000-4000-8000-000000000001'::uuid, 30),
            ('b9000000-0000-4000-8000-000000000002'::uuid, 7),
            ('b9000000-0000-4000-8000-000000000002'::uuid, 30) $$,
  'each threshold reached is recorded'
);
select is(
  (select count(*)::int from public.notifications
   where type = 'document_expiring' and data ->> 'documentId' = 'b9000000-0000-4000-8000-000000000002'
     and user_id = 'a9000000-0000-4000-8000-000000000002'),
  1, 'a document that reaches two thresholds at once is warned once'
);
select results_eq(
  $$ select data ->> 'requirementName', data ->> 'ownerLabel', (data ->> 'daysLeft')::int between 2 and 4
     from public.notifications
     where type = 'document_expiring' and user_id = 'a9000000-0000-4000-8000-000000000005' $$,
  $$ values ('Licencia federal de conductor'::text, 'Óscar Operador'::text, true) $$,
  'the operator is warned about their own license, with its name and the days left'
);
select is(
  tests.pending('a9000000-0000-4000-8000-000000000005', 'document_expiring'), 1,
  'the operator gets only the warning of their license'
);
select is(
  tests.pending('a9000000-0000-4000-8000-000000000002', 'document_expiring'), 2,
  'the carrier is warned about the company policy and the license'
);
select is(
  tests.pending('a9000000-0000-4000-8000-000000000001', 'document_expiring'), 0,
  'other companies are not warned'
);
select is(public.process_document_expiry(), 0, 'running it again warns nobody');

-- Seven days later the policy reaches the second threshold.
update public.documents set expires_at = now() + interval '6 days' where id = 'b9000000-0000-4000-8000-000000000001';
delete from public.document_expiry_notices
where document_id = 'b9000000-0000-4000-8000-000000000001' and threshold_days = 30;
insert into public.document_expiry_notices (document_id, threshold_days, expires_at)
values ('b9000000-0000-4000-8000-000000000001', 30, now() + interval '6 days');
select is(public.process_document_expiry(), 1, 'the 7-day warning comes after the 30-day one');
select is(
  tests.pending('a9000000-0000-4000-8000-000000000002', 'document_expiring'), 3,
  'the carrier got the second warning of the policy'
);
select throws_ok(
  $$ select public.process_document_expiry('{0}') $$, '22023', null, 'thresholds are validated'
);

-- ---------------------------------------------------------------------------
-- Cron: operator without location on an active trip
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a9000000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('open_offer'));
select tests.login('a9000000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip'), 'e9000000-0000-4000-8000-0000000000a1',
                          'd9000000-0000-4000-8000-000000000005');
reset role;
select set_config('request.jwt.claims', '', true);

select is(public.remind_stale_trip_locations(), 0, 'an assigned trip that has not started is not reminded');

update public.trips set status = 'in_transit', started_at = now() - interval '5 hours' where id = tests.val('trip');
insert into public.trip_locations (trip_id, recorded_at, latitude, longitude)
values (tests.val('trip'), now() - interval '4 hours', 20.9, -102.0);

select is(public.remind_stale_trip_locations(interval '3 hours'), 1, 'a trip 4 h without location is reminded');
select results_eq(
  $$ select user_id, (data ->> 'hoursWithoutLocation')::int, data ->> 'tripId', data ->> 'originCity'
     from public.notifications where type = 'trip_location_stale' $$,
  $$ values ('a9000000-0000-4000-8000-000000000005'::uuid, 4, tests.val('trip')::text, 'Guadalajara'::text) $$,
  'the reminder goes to the assigned operator with the hours and the route'
);
select is(public.remind_stale_trip_locations(interval '3 hours'), 0, 'one reminder per gap');
select is(public.remind_stale_trip_locations(interval '5 hours'), 0, 'a longer threshold is not reached');

-- The reminder went out 3.5 h ago; a point arrived 3 h ago (closing that gap)
-- and nothing since: a new gap, a new reminder.
update public.notifications set created_at = now() - interval '210 minutes' where type = 'trip_location_stale';
insert into public.trip_locations (trip_id, recorded_at, latitude, longitude)
values (tests.val('trip'), now() - interval '3 hours', 21.0, -102.1);
select is(public.remind_stale_trip_locations(interval '3 hours'), 1, 'a new gap after a new point is reminded again');
insert into public.trip_locations (trip_id, recorded_at, latitude, longitude)
values (tests.val('trip'), now() - interval '1 minute', 21.1, -102.2);
select is(public.remind_stale_trip_locations(interval '15 minutes'), 0, 'a recent location is not reminded');
update public.trips set status = 'delivered', delivered_at = now() where id = tests.val('trip');
select is(public.remind_stale_trip_locations(interval '15 minutes'), 0, 'a delivered trip is not reminded');
select throws_ok(
  $$ select public.remind_stale_trip_locations(interval '1 minute') $$, '22023', null,
  'the threshold is validated'
);

select * from finish();
rollback;
