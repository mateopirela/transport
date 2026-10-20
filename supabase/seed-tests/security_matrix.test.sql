-- Security matrix (B24): role x table x operation x "another company", on the
-- demo seed plus a fixture row in every table the seed leaves empty.
--
--   supabase test db supabase/seed-tests
--
-- * Read: for every user of the seed (each role and company), an outsider of
--   each role (approved companies with no relation to the seed) and anon,
--   every row they can read in every table (and Storage object) must belong
--   to their own company, by the ownership rules of tests.ownership.
-- * Update: same check for the rows they manage to update in the tables that
--   accept direct updates. Clients cannot delete (18_security_audit).
-- * RPCs: the outsiders call every client RPC on the seed's rows. Each call
--   must fail, or change nothing and return nothing.
-- * Business units (G1a.2): a coordinator reads only the rows of their
--   business units (tests.unit_ownership), and the coordinator of another
--   business unit of the same company cannot act on them.
--
-- The catalog checks force the matrix to grow with the schema: every table
-- needs an ownership rule and at least one row, and every client RPC needs a
-- call here (or to be on the reviewed list of RPCs scoped to the caller).
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

create schema tests;
grant usage on schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: the outsiders and a row in every table the seed leaves empty
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b2400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'xavier@fuera.test', now(),
   null, '{"role":"shipper","phone":"+525500000000"}', now(), now()),
  ('b2400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'yolanda@fuera.test', now(),
   null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
  ('b2400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'zoe@fuera.test', now(),
   '{"provisioned_by": "redeem-invitation"}'::jsonb, '{"role":"operator","phone":"+525500000000"}', now(), now()),
  -- An operator account without a company yet (provisioned by the Edge Function, G2).
  ('b2400000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'walter@fuera.test', now(),
   '{"provisioned_by": "redeem-invitation"}'::jsonb, '{"role":"operator","phone":"+525500000000"}', now(), now());
insert into public.companies (id, type, legal_name, rfc, status) values
  ('c2400000-0000-4000-8000-000000000001', 'shipper', 'Envíos Ajenos, S.A. de C.V.', 'EAJ150301KQ3', 'approved'),
  ('c2400000-0000-4000-8000-000000000002', 'carrier', 'Fletes Ajenos, S.A. de C.V.', 'FAJ150301KQ4', 'approved');
update public.profiles set company_id = 'c2400000-0000-4000-8000-000000000001'
where id = 'b2400000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c2400000-0000-4000-8000-000000000002'
where id in ('b2400000-0000-4000-8000-000000000002', 'b2400000-0000-4000-8000-000000000003');
insert into public.operators (id, company_id, profile_id, full_name) values
  ('d2400000-0000-4000-8000-000000000003', 'c2400000-0000-4000-8000-000000000002',
   'b2400000-0000-4000-8000-000000000003', 'Zoé Ajena');

-- Seed rows used below. T1: trip in unloading (shipper Aceros del Norte,
-- carrier Transportes Regios del Norte, operator Pedro López).
create table tests.vals (name text primary key, id uuid);
insert into tests.vals values
  ('trip', '5eed0008-0000-4000-8000-000000000001'),
  ('vehicle', '5eed0004-0000-4000-8000-000000000002'),
  ('operator', '5eed0003-0000-4000-8000-000000000001'),
  ('operator_without_account', '5eed0003-0000-4000-8000-000000000003'),
  ('shipper_company', '5eed0002-0000-4000-8000-000000000001'),
  ('carrier_company', '5eed0002-0000-4000-8000-000000000004');
insert into tests.vals
select 'trip_conversation', id from public.conversations
where trip_id = '5eed0008-0000-4000-8000-000000000001' and kind = 'trip';
-- H1: the carrier's internal conversation of T1 (never the shipper's).
insert into tests.vals
select 'internal_conversation', id from public.conversations
where trip_id = '5eed0008-0000-4000-8000-000000000001' and kind = 'trip_internal';
insert into tests.vals
select 'negotiation_conversation', id from public.conversations where kind = 'negotiation' order by id limit 1;
insert into tests.vals select 'document', id from public.documents order by id limit 1;
insert into tests.vals select 'pending_document', id from public.documents where status = 'pending_review' limit 1;
insert into tests.vals select 'draft_load', id from public.loads where status = 'draft' limit 1;
insert into tests.vals select 'open_load', id from public.loads where status = 'published' order by id limit 1;
insert into tests.vals select 'negotiating_load', id from public.loads where status = 'negotiating' order by id limit 1;
insert into tests.vals select 'contracted_load', id from public.loads where status = 'contracted' limit 1;
insert into tests.vals select 'pending_offer', id from public.offers where status = 'pending' order by id limit 1;
insert into tests.vals select 'availability', id from public.vehicle_availability order by id limit 1;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;
grant select on tests.vals to anon, authenticated;

insert into public.audit_log (actor_id, action, table_name, record_id, company_id)
values ('5eed0001-0000-4000-8000-000000000001', 'update', 'companies',
        tests.val('carrier_company'), tests.val('carrier_company'));
insert into public.document_expiry_notices (document_id, threshold_days, expires_at)
values (tests.val('document'), 30, now() + interval '30 days');
insert into public.incidents (id, trip_id, kind, description, occurred_at, reported_by, reporter_role)
values ('e2400000-0000-4000-8000-000000000001', tests.val('trip'), 'delay', 'Tráfico en la caseta', now(),
        '5eed0001-0000-4000-8000-000000000008', 'operator');
insert into tests.vals values ('incident', 'e2400000-0000-4000-8000-000000000001');
insert into public.location_consents (user_id, policy_version, platform)
values ('5eed0001-0000-4000-8000-000000000008', '2026-10-01', 'android');
insert into public.message_reads (conversation_id, user_id, last_read_at)
values (tests.val('trip_conversation'), '5eed0001-0000-4000-8000-000000000002', now());
insert into public.operator_invitations (id, company_id, operator_id, email, code_hash, expires_at)
values ('f2400000-0000-4000-8000-000000000001', tests.val('carrier_company'), tests.val('operator_without_account'),
        -- History row (the codes were retired by G2): hash of a normalized code (the old RPC dropped
        -- spaces and dashes and upper-cases it).
        'zoe@fuera.test', sha256(convert_to('B24INVITECODE', 'UTF8')), now() + interval '1 day');
insert into tests.vals values ('invitation', 'f2400000-0000-4000-8000-000000000001');
-- Invitation links (G1b): a coordinator invitation of the carrier and an
-- operator invitation of "Corredor MTY–GDL", both with a fixed token.
insert into public.invitations (id, company_id, kind, business_unit_ids, token_hash, expires_at, created_by)
values ('f2400000-0000-4000-8000-000000000002', tests.val('carrier_company'), 'coordinator',
        array(select id from public.business_units where company_id = tests.val('carrier_company') order by name),
        sha256(convert_to(rpad('b24coordinatorlink', 43, '0'), 'UTF8')), now() + interval '1 day',
        '5eed0001-0000-4000-8000-000000000005'),
       ('f2400000-0000-4000-8000-000000000003', tests.val('carrier_company'), 'operator',
        array[(select business_unit_id from public.operators where id = tests.val('operator'))],
        sha256(convert_to(rpad('b24operatorlink', 43, '0'), 'UTF8')), now() + interval '1 day',
        '5eed0001-0000-4000-8000-000000000011');
insert into tests.vals values ('link_invitation', 'f2400000-0000-4000-8000-000000000003');
-- The business units of the carrier, by id: an outsider cannot read them, so
-- the RPC calls below must name them, not look them up.
insert into tests.vals select 'corredor_unit', business_unit_id from public.operators where id = tests.val('operator');
insert into tests.vals select 'regional_unit', id from public.business_units
where company_id = tests.val('carrier_company') and id <> tests.val('corredor_unit');
-- An operator row of "Corredor MTY–GDL" without an account (G2): the target
-- of an `operator` link that names a row.
insert into public.operators (id, company_id, business_unit_id, full_name)
values ('f2400000-0000-4000-8000-0000000000a1', tests.val('carrier_company'), tests.val('corredor_unit'), 'Ulises Sin Cuenta');
insert into tests.vals values ('corredor_operator_without_account', 'f2400000-0000-4000-8000-0000000000a1');
-- A provisioning ticket of redeem-invitation (G2): service role only.
insert into public.operator_provisioning_tickets (email, nonce_hash, expires_at)
values ('528119990002@tel.transport.invalid', extensions.digest(repeat('n', 64), 'sha256'), now() + interval '5 minutes');
insert into public.push_tokens (user_id, token, platform)
values ('5eed0001-0000-4000-8000-000000000008', 'ExponentPushToken[b24SeedDeviceToken]', 'android');
insert into public.route_distance_cache (origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_minutes)
values (25.69, -100.32, 20.66, -103.35, 820, 540);
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('documents', tests.val('carrier_company') || '/company/' || tests.val('carrier_company')
                || '/a2400000-0000-4000-8000-000000000001.pdf',
   '5eed0001-0000-4000-8000-000000000005', '{"mimetype": "application/pdf", "size": 2048}'),
  ('evidence', tests.val('trip') || '/delivery/a2400000-0000-4000-8000-000000000002.jpg',
   '5eed0001-0000-4000-8000-000000000008', '{"mimetype": "image/jpeg", "size": 2048}'),
  ('trip-documents', tests.val('trip') || '/a2400000-0000-4000-8000-000000000003.pdf',
   '5eed0001-0000-4000-8000-000000000005', '{"mimetype": "application/pdf", "size": 2048}'),
  ('chat', tests.val('trip_conversation') || '/a2400000-0000-4000-8000-000000000004.jpg',
   '5eed0001-0000-4000-8000-000000000002', '{"mimetype": "image/jpeg", "size": 2048}'),
  ('chat', tests.val('internal_conversation') || '/a2400000-0000-4000-8000-000000000005.jpg',
   '5eed0001-0000-4000-8000-000000000008', '{"mimetype": "image/jpeg", "size": 2048}');
insert into public.trip_evidence (trip_id, stage, storage_path, sha256, captured_at, uploaded_by)
values (tests.val('trip'), 'delivery', tests.val('trip') || '/delivery/a2400000-0000-4000-8000-000000000002.jpg',
        repeat('ab', 32), now(), '5eed0001-0000-4000-8000-000000000008');
insert into public.trip_documents (trip_id, kind, storage_path, file_name, uploaded_by)
values (tests.val('trip'), 'carta_porte', tests.val('trip') || '/a2400000-0000-4000-8000-000000000003.pdf',
        'carta-porte.pdf', '5eed0001-0000-4000-8000-000000000005');
-- G6: a provider decision of the seed's pair and a view of a shared document
-- (the seed's open trips already share the carrier's documents).
insert into public.provider_approvals (shipper_company_id, carrier_company_id, status, decided_by)
values (tests.val('shipper_company'), tests.val('carrier_company'), 'approved', '5eed0001-0000-4000-8000-000000000002');
insert into public.provider_approval_events (shipper_company_id, carrier_company_id, status, decided_by)
values (tests.val('shipper_company'), tests.val('carrier_company'), 'approved', '5eed0001-0000-4000-8000-000000000002');
insert into tests.vals
select 'share', id from public.document_shares where trip_id = tests.val('trip') and revoked_at is null order by id limit 1;
insert into public.document_share_views (share_id, viewer_id)
values (tests.val('share'), '5eed0001-0000-4000-8000-000000000002');
-- G5: a released unit of T1 (released, so it blocks nothing the matrix calls).
insert into public.vehicle_release_tasks (
  id, company_id, vehicle_id, business_unit_id, trip_id, status, released_at, released_location, released_city,
  released_state, released_available_from
)
select 'e2400000-0000-4000-8000-000000000002', v.company_id, v.id, v.business_unit_id, tests.val('trip'), 'released',
       now(), extensions.st_setsrid(extensions.st_makepoint(-103.35, 20.66), 4326)::extensions.geography,
       'Guadalajara', 'Jalisco', now()
from public.vehicles v where v.id = tests.val('vehicle');
insert into tests.vals values ('release_task', 'e2400000-0000-4000-8000-000000000002');
insert into public.rate_limit_counters (bucket, subject, window_start, hits)
values ('recommendations', '5eed0001-0000-4000-8000-000000000005', now(), 1);
insert into public.product_events (name, user_id, user_role, company_id, properties)
values ('recommendations_viewed', '5eed0001-0000-4000-8000-000000000005', 'manager', tests.val('carrier_company'),
        '{"recommendations": 3}');
-- A tracking link of Aceros del Norte on T1 (G7). Only the hash of the token is
-- stored; the outsiders below try to revoke it and to open links by token.
insert into public.share_links (id, kind, company_id, trip_id, token_hash, created_by, expires_at)
values ('f2400000-0000-4000-8000-000000000002', 'trip_tracking_public', tests.val('shipper_company'), tests.val('trip'),
        sha256(convert_to('B24SHARETOKEN', 'UTF8')), '5eed0001-0000-4000-8000-000000000002', now() + interval '1 day');
insert into tests.vals values ('share_link', 'f2400000-0000-4000-8000-000000000002');
-- H4: a road preference of the carrier and a risk on a pilot segment (the
-- migration seeds no risks: none has a public source yet).
insert into tests.vals select 'road_segment', id from public.road_segments where code = 'SLP-LAG';
insert into tests.vals select 'road_corridor', id from public.road_corridors where code = 'MTY-GDL-SLP';
insert into public.carrier_road_preferences (company_id, segment_id, preference)
values (tests.val('carrier_company'), tests.val('road_segment'), 'avoid');
insert into public.road_segment_risks (id, segment_id, level, from_hour, to_hour, description, source, observed_on)
values ('e2400000-0000-4000-8000-000000000003', tests.val('road_segment'), 'medium', 22, 6, 'Prueba', 'Prueba',
        current_date);
insert into tests.vals values ('road_risk', 'e2400000-0000-4000-8000-000000000003');
-- A Stripe event applied to the seed's carrier (H3): admins only.
insert into public.billing_events (stripe_event_id, type, company_id, processed_at)
values ('evt_b24fixture', 'customer.subscription.updated', tests.val('carrier_company'), now());

-- ---------------------------------------------------------------------------
-- Ownership: when a row belongs to company $1 / user $2 (evaluated as the
-- database owner, so the joins do not depend on the caller's RLS).
-- ---------------------------------------------------------------------------
create table tests.ownership (tbl text primary key, owned text not null);
insert into tests.ownership values
  -- Admin only, service role only, or reachable only through RPCs.
  ('public.audit_log', 'false'),
  ('public.document_expiry_notices', 'false'),
  ('public.route_distance_cache', 'false'),
  ('public.rate_limit_counters', 'false'),
  ('public.operator_provisioning_tickets', 'false'),
  ('public.product_events', 'false'),
  -- Stripe events applied by the webhook (H3): admins only.
  ('public.billing_events', 'false'),
  -- Catalogs every signed-in user reads.
  ('public.document_requirements', 'true'),
  ('public.trip_evidence_requirements', 'true'),
  ('public.trip_document_requirements', 'true'),
  ('public.license_unit_compatibility', 'true'),
  -- Road catalog (H4): reference data, written only by admins.
  ('public.road_segments', 'true'),
  ('public.road_segment_tolls', 'true'),
  ('public.road_segment_risks', 'true'),
  ('public.road_corridors', 'true'),
  ('public.road_corridor_segments', 'true'),
  -- H3: global settings (no secrets) and the plans on offer.
  ('public.platform_settings', 'true'),
  ('public.subscription_plans', 't.active'),
  -- Company data.
  ('public.companies', 't.id = $1'),
  ('public.profiles', 't.company_id = $1 or t.id = $2'),
  ('public.documents', 't.company_id = $1'),
  ('public.vehicles', 't.company_id = $1'),
  ('public.operators', 't.company_id = $1'),
  ('public.operator_invitations', 't.company_id = $1'),
  ('public.invitations', 't.company_id = $1'),
  ('public.carrier_routes', 't.company_id = $1'),
  ('public.carrier_road_preferences', 't.company_id = $1'),
  -- Waiting times (H5): the trip's shipper and carrier.
  ('public.trip_stop_dwells', 't.shipper_company_id = $1 or t.carrier_company_id = $1'),
  ('public.business_units', 't.company_id = $1'),
  ('public.business_unit_coordinators', 't.company_id = $1'),
  ('public.vehicle_availability', 't.company_id = $1'),
  -- Share links (G7): the company that created them.
  ('public.share_links', 't.company_id = $1'),
  ('public.vehicle_release_tasks', 't.company_id = $1'),
  ('public.company_subscriptions', 't.company_id = $1'),
  -- Marketplace: open loads are visible to approved carriers. A carrier that
  -- negotiated keeps seeing the load unless another carrier won it.
  ('public.loads', $$
     $1 in (t.shipper_company_id, t.carrier_company_id)
     or ((t.carrier_company_id is null or t.carrier_company_id = $1)
         and exists (select 1 from public.negotiations n where n.load_id = t.id and n.carrier_company_id = $1))
     or (t.status in ('published', 'negotiating') and t.archived_at is null
         and exists (select 1 from public.companies c
                     where c.id = $1 and c.type = 'carrier' and c.status = 'approved' and c.archived_at is null))
  $$),
  ('public.negotiations', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.offers', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.trips', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  -- The internal chat of a trip (H1, D28) is the carrier's only.
  ('public.conversations', '$1 = t.carrier_company_id or ($1 = t.shipper_company_id and t.kind <> ''trip_internal'')'),
  -- Children of a trip or a conversation: parties of the parent.
  ('public.trip_events', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  ('public.trip_evidence', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  ('public.trip_documents', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  -- G6: the shares of a trip are its parties'; the log of views, the carrier's
  -- (only its manager reads it); the provider decision, the pair's.
  ('public.document_shares', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.document_share_views', 'exists (select 1 from public.document_shares x where x.id = t.share_id and x.carrier_company_id = $1)'),
  ('public.provider_approvals', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.provider_approval_events', '$1 in (t.shipper_company_id, t.carrier_company_id)'),
  ('public.incidents', 'exists (select 1 from public.trips x where x.id = t.trip_id and $1 in (x.shipper_company_id, x.carrier_company_id))'),
  -- The shipper sees the GPS track only while the trip is active.
  ('public.trip_locations', $$
     exists (select 1 from public.trips x where x.id = t.trip_id
             and (x.carrier_company_id = $1 or (x.shipper_company_id = $1 and public.trip_is_active(x.status))))
  $$),
  ('public.messages', $$
     exists (select 1 from public.conversations x where x.id = t.conversation_id
             and ($1 = x.carrier_company_id or ($1 = x.shipper_company_id and x.kind <> 'trip_internal')))
  $$),
  ('public.message_reads', $$
     exists (select 1 from public.conversations x where x.id = t.conversation_id
             and ($1 = x.carrier_company_id or ($1 = x.shipper_company_id and x.kind <> 'trip_internal')))
  $$),
  -- Personal rows.
  ('public.notifications', 't.user_id = $2'),
  ('public.push_tokens', 't.user_id = $2'),
  ('public.location_consents', 't.user_id = $2'),
  -- Files: by the first segment of the path.
  ('storage.objects', $$
     case t.bucket_id
       when 'documents' then split_part(t.name, '/', 1) = $1::text
       when 'evidence' then exists (select 1 from public.trips x where x.id::text = split_part(t.name, '/', 1)
                                    and $1 in (x.shipper_company_id, x.carrier_company_id))
       when 'trip-documents' then exists (select 1 from public.trips x where x.id::text = split_part(t.name, '/', 1)
                                          and $1 in (x.shipper_company_id, x.carrier_company_id))
       when 'chat' then exists (select 1 from public.conversations x where x.id::text = split_part(t.name, '/', 1)
                                and ($1 = x.carrier_company_id
                                     or ($1 = x.shipper_company_id and x.kind <> 'trip_internal')))
       else false
     end
  $$);

-- A coordinator (G1a.2): stricter rules over $3, the business units assigned
-- to them. Tables without a rule here keep the company rule (business units,
-- the usual routes, the company's documents and the published loads are
-- shared by the company's staff).
create table tests.unit_ownership (tbl text primary key, owned text not null);
insert into tests.unit_ownership values
  ('public.business_unit_coordinators', 't.profile_id = $2'),
  ('public.vehicles', 't.business_unit_id = any ($3)'),
  ('public.operators', 't.business_unit_id = any ($3)'),
  ('public.operator_invitations', 'exists (select 1 from public.operators o where o.id = t.operator_id and o.business_unit_id = any ($3))'),
  ('public.invitations', 't.kind <> ''coordinator'' and t.business_unit_ids <@ $3'),
  ('public.vehicle_availability', 'exists (select 1 from public.vehicles v where v.id = t.vehicle_id and v.business_unit_id = any ($3))'),
  ('public.vehicle_release_tasks', 'exists (select 1 from public.vehicles v where v.id = t.vehicle_id and v.business_unit_id = any ($3))'),
  ('public.documents', $$
     t.company_id = $1 and (
       t.owner_type = 'company'
       or exists (select 1 from public.vehicles v where t.owner_type = 'vehicle' and v.id = t.owner_id and v.business_unit_id = any ($3))
       or exists (select 1 from public.operators o where t.owner_type = 'operator' and o.id = t.owner_id and o.business_unit_id = any ($3)))
  $$),
  ('public.loads', $$
     exists (select 1 from public.negotiations n where n.load_id = t.id and n.business_unit_id = any ($3)
             and (t.carrier_company_id is null or t.carrier_company_id = $1))
     or (t.carrier_company_id = $1
         and exists (select 1 from public.trips x where x.load_id = t.id and x.business_unit_id = any ($3)))
     or (t.status in ('published', 'negotiating') and t.archived_at is null
         and exists (select 1 from public.companies c
                     where c.id = $1 and c.type = 'carrier' and c.status = 'approved' and c.archived_at is null))
  $$),
  ('public.negotiations', 't.business_unit_id = any ($3)'),
  ('public.offers', 'exists (select 1 from public.negotiations n where n.id = t.negotiation_id and n.business_unit_id = any ($3))'),
  ('public.trips', 't.business_unit_id = any ($3)'),
  ('public.conversations', 'public.conversation_business_unit_id_as_owner(t.id) = any ($3)'),
  ('public.trip_events', 'exists (select 1 from public.trips x where x.id = t.trip_id and x.business_unit_id = any ($3))'),
  ('public.trip_evidence', 'exists (select 1 from public.trips x where x.id = t.trip_id and x.business_unit_id = any ($3))'),
  ('public.trip_documents', 'exists (select 1 from public.trips x where x.id = t.trip_id and x.business_unit_id = any ($3))'),
  ('public.document_shares', 'exists (select 1 from public.trips x where x.id = t.trip_id and x.business_unit_id = any ($3))'),
  ('public.incidents', 'exists (select 1 from public.trips x where x.id = t.trip_id and x.business_unit_id = any ($3))'),
  ('public.trip_locations', 'exists (select 1 from public.trips x where x.id = t.trip_id and x.business_unit_id = any ($3))'),
  ('public.messages', 'public.conversation_business_unit_id_as_owner(t.conversation_id) = any ($3)'),
  ('public.message_reads', 'public.conversation_business_unit_id_as_owner(t.conversation_id) = any ($3)'),
  ('storage.objects', $$
     case t.bucket_id
       when 'documents' then split_part(t.name, '/', 1) = $1::text and (
         split_part(t.name, '/', 2) = 'company'
         or exists (select 1 from public.vehicles v where v.id::text = split_part(t.name, '/', 3) and v.business_unit_id = any ($3))
         or exists (select 1 from public.operators o where o.id::text = split_part(t.name, '/', 3) and o.business_unit_id = any ($3)))
       when 'evidence' then exists (select 1 from public.trips x where x.id::text = split_part(t.name, '/', 1)
                                    and x.business_unit_id = any ($3))
       when 'trip-documents' then exists (select 1 from public.trips x where x.id::text = split_part(t.name, '/', 1)
                                          and x.business_unit_id = any ($3))
       when 'chat' then public.conversation_business_unit_id_as_owner(split_part(t.name, '/', 1)::uuid) = any ($3)
       else false
     end
  $$);

-- The business unit of a conversation, read as the database owner (the
-- client helper answers only to the conversation's carrier staff).
create function public.conversation_business_unit_id_as_owner(p_conversation_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(n.business_unit_id, x.business_unit_id)
  from public.conversations c
  left join public.negotiations n on n.id = c.negotiation_id
  left join public.trips x on x.id = c.trip_id
  where c.id = p_conversation_id;
$$;

select set_eq(
  $$ select tbl from tests.ownership where tbl like 'public.%' $$,
  $$ select 'public.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'spatial_ref_sys' $$,
  'every table in public has an ownership rule in the matrix'
);

create function tests.empty_tables()
returns setof text
language plpgsql
as $$
declare
  v_tbl text;
  v_any boolean;
begin
  for v_tbl in select tbl from tests.ownership order by tbl loop
    execute format('select exists (select 1 from %s)', v_tbl) into v_any;
    if not v_any then
      return next v_tbl;
    end if;
  end loop;
end;
$$;

select is_empty($$ select * from tests.empty_tables() $$, 'every table of the matrix has rows to leak');

-- ---------------------------------------------------------------------------
-- Read and update matrix
-- ---------------------------------------------------------------------------

-- Acts as p_uid (role authenticated, or anon when p_uid is null).
create function tests.act_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{"role": "anon"}'
         else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
end;
$$;

-- Primary key of a table as a text expression over alias t: the identity of
-- a row both for the caller (who may only read some columns) and the owner.
create function tests.row_key(p_tbl text)
returns text
language sql
stable
as $$
  select 'row(' || string_agg(format('t.%I', a.attname), ', ' order by k.ord) || ')::text'
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = p_tbl::regclass and i.indisprimary;
$$;

select is_empty(
  $$ select tbl from tests.ownership where tests.row_key(tbl) is null $$,
  'every table of the matrix has a primary key to identify rows'
);

-- Rows (by key) that do not belong to p_uid, as "table: n rows".
create function tests.foreign_rows(p_uid uuid, p_tbl text, p_keys text[])
returns text
language plpgsql
as $$
declare
  v_coordinator boolean := exists (select 1 from public.profiles where id = p_uid and role = 'coordinator');
  v_owned text := coalesce(
    (select owned from tests.unit_ownership where tbl = p_tbl and v_coordinator),
    (select owned from tests.ownership where tbl = p_tbl)
  );
  v_company uuid := (select company_id from public.profiles where id = p_uid);
  v_units uuid[] := (
    select coalesce(array_agg(bc.business_unit_id), '{}')
    from public.business_unit_coordinators bc
    join public.business_units b on b.id = bc.business_unit_id and b.archived_at is null
    where bc.profile_id = p_uid
  );
  v_count bigint;
begin
  execute format('select count(*) from %s t where %s = any ($4) and not coalesce((%s), false)',
                 p_tbl, tests.row_key(p_tbl), v_owned)
  into v_count using v_company, p_uid, v_units, p_keys;
  return case when v_count > 0 then format('%s: %s rows', p_tbl, v_count) end;
end;
$$;

create function tests.read_leaks(p_uid uuid)
returns setof text
language plpgsql
as $$
declare
  v_tbl text;
  v_keys text[];
  v_leak text;
begin
  for v_tbl in select tbl from tests.ownership order by tbl loop
    v_keys := null;
    -- Without any privilege the table is closed; otherwise every error counts.
    if has_any_column_privilege(case when p_uid is null then 'anon' else 'authenticated' end, v_tbl, 'select') then
      perform tests.act_as(p_uid);
      execute format('select array_agg(%s) from %s t', tests.row_key(v_tbl), v_tbl) into v_keys;
      reset role;
    end if;
    v_leak := tests.foreign_rows(p_uid, v_tbl, v_keys);
    if v_leak is not null then
      return next v_leak;
    end if;
  end loop;
end;
$$;

-- Each update is rolled back (the block raises after counting).
create function tests.update_leaks(p_uid uuid)
returns setof text
language plpgsql
as $$
declare
  r record;
  v_keys text[];
  v_leak text;
begin
  for r in
    select 'public.' || table_name as tbl, min(column_name::text) as col
    from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
    group by table_name order by table_name
  loop
    v_leak := null;
    begin
      perform tests.act_as(p_uid);
      execute format('with u as (update %s t set %I = t.%I returning %s as k) select array_agg(k) from u',
                     r.tbl, r.col, r.col, tests.row_key(r.tbl))
      into v_keys;
      reset role;
      v_leak := tests.foreign_rows(p_uid, r.tbl, v_keys);
      raise exception 'b24_rollback';
    exception
      when insufficient_privilege then
        v_leak := null;
      when others then
        if sqlerrm <> 'b24_rollback' then
          raise;
        end if;
    end;
    reset role;
    if v_leak is not null then
      return next v_leak;
    end if;
  end loop;
end;
$$;

create table tests.personas (uid uuid, label text);
insert into tests.personas
select p.id, p.role || ' ' || coalesce(u.email, '')
from public.profiles p join auth.users u on u.id = p.id
where p.role <> 'admin';

select is_empty(
  format($$ select * from tests.read_leaks(%L) $$, uid),
  'read: ' || label || ' only sees rows of their company (a coordinator, of their business units)'
)
from tests.personas order by uid;

select is_empty($$ select * from tests.read_leaks(null) $$, 'read: anon sees nothing');

select is_empty(
  $$ select p.label || ' -> ' || l from tests.personas p cross join lateral tests.update_leaks(p.uid) l $$,
  'update: no user updates rows of another company'
);

-- ---------------------------------------------------------------------------
-- RPC matrix: the outsiders on the seed's rows
-- ---------------------------------------------------------------------------
create table tests.rpc_calls (fn text, call text);
insert into tests.rpc_calls values
  ('submit_document', $$ public.submit_document((select id from public.document_requirements where owner_type = 'company' limit 1),
       'company', tests.val('carrier_company'),
       tests.val('carrier_company') || '/company/' || tests.val('carrier_company') || '/a2400000-0000-4000-8000-000000000001.pdf',
       'acta.pdf', now() + interval '1 year') $$),
  ('review_document', $$ public.review_document(tests.val('pending_document'), 'approve', null, now() + interval '1 year') $$),
  ('review_company', $$ public.review_company(tests.val('carrier_company'), 'suspend', 'x') $$),
  ('admin_list_users', $$ (select count(*) from public.admin_list_users(null, 50, 0)) $$),
  ('create_invitation', $$ (select count(*) from public.create_invitation('operator', '{}', tests.val('corredor_operator_without_account'))) $$),
  ('create_invitation', $$ (select count(*) from public.create_invitation('coordinator',
       array[tests.val('corredor_unit'), tests.val('regional_unit')])) $$),
  ('create_invitation', $$ (select count(*) from public.create_invitation('operator', array[tests.val('corredor_unit')])) $$),
  ('create_invitation', $$ (select count(*) from public.create_invitation('operator_access_reset', '{}', tests.val('operator'))) $$),
  ('revoke_invitation', $$ public.revoke_invitation(tests.val('link_invitation')) $$),
  ('accept_coordinator_invitation', $$ public.accept_coordinator_invitation(rpad('b24coordinatorlink', 43, '0')) $$),
  ('rename_business_unit', $$ public.rename_business_unit(tests.val('corredor_unit'), 'Ajena') $$),
  ('archive_business_unit', $$ public.archive_business_unit(tests.val('regional_unit')) $$),
  ('set_coordinator_units', $$ public.set_coordinator_units('5eed0001-0000-4000-8000-000000000011',
       array[tests.val('regional_unit')]) $$),
  ('remove_company_member', $$ public.remove_company_member('5eed0001-0000-4000-8000-000000000011') $$),
  ('move_vehicle_to_unit', $$ public.move_vehicle_to_unit(tests.val('vehicle'), tests.val('regional_unit')) $$),
  ('move_operator_to_unit', $$ public.move_operator_to_unit(tests.val('operator_without_account'),
       tests.val('regional_unit')) $$),
  ('set_vehicle_availability', $$ public.set_vehicle_availability(tests.val('vehicle'), now() + interval '1 hour',
       25.69, -100.32, 'Monterrey', 'Nuevo León') $$),
  ('clear_vehicle_availability', $$ public.clear_vehicle_availability(tests.val('vehicle')) $$),
  ('update_load', $$ public.update_load(tests.val('draft_load'), '{"description": "Cambiada"}') $$),
  ('publish_load', $$ public.publish_load(tests.val('draft_load')) $$),
  ('cancel_load', $$ public.cancel_load(tests.val('open_load'), 'x') $$),
  ('make_offer', $$ public.make_offer(tests.val('contracted_load'), 3000000, null, null) $$),
  ('counter_offer', $$ public.counter_offer(tests.val('pending_offer'), 3100000, null, null) $$),
  ('reject_offer', $$ public.reject_offer(tests.val('pending_offer'), 'x') $$),
  ('withdraw_offer', $$ public.withdraw_offer(tests.val('pending_offer')) $$),
  ('accept_offer', $$ public.accept_offer(tests.val('pending_offer')) $$),
  ('admin_create_offer', $$ public.admin_create_offer(tests.val('open_load'), 'c2400000-0000-4000-8000-000000000002',
       3000000, null, null, true) $$),
  ('admin_accept_offer', $$ public.admin_accept_offer(tests.val('pending_offer')) $$),
  ('load_negotiation_carriers', $$ (select count(*) from public.load_negotiation_carriers(tests.val('negotiating_load'))) $$),
  ('load_offer_vehicles', $$ (select count(*) from public.load_offer_vehicles(tests.val('negotiating_load'))) $$),
  ('match_candidates', $$ (select count(*) from public.match_candidates(tests.val('vehicle'), null, 500, 50)) $$),
  ('match_candidates', $$ (select count(*) from public.match_candidates(null, tests.val('availability'), 500, 50)) $$),
  ('assign_trip', $$ public.assign_trip(tests.val('trip'), tests.val('vehicle'), tests.val('operator')) $$),
  ('record_trip_event', $$ public.record_trip_event(tests.val('trip'), 'unloading_finished', now(), 20.66, -103.35,
       10, null, null, null, null) $$),
  ('set_estimated_unload_end', $$ public.set_estimated_unload_end(tests.val('trip'), now() + interval '2 hours', now(), null) $$),
  ('record_trip_locations', $$ public.record_trip_locations(tests.val('trip'),
       jsonb_build_array(jsonb_build_object('recordedAt', now(), 'lat', 20.66, 'lng', -103.35))) $$),
  ('add_trip_evidence', $$ public.add_trip_evidence(tests.val('trip'), 'delivery',
       tests.val('trip') || '/delivery/a2400000-0000-4000-8000-000000000002.jpg', repeat('cd', 32), now(), null, null, null) $$),
  ('confirm_delivery', $$ public.confirm_delivery(tests.val('trip'), 'Recibió Juan') $$),
  ('cancel_trip', $$ public.cancel_trip(tests.val('trip'), 'x') $$),
  ('cancel_trip', $$ public.cancel_trip(tests.val('trip'), 'mechanical_failure', null) $$),
  ('vehicle_release_context', $$ (select count(*) from public.vehicle_release_context(tests.val('release_task'))) $$),
  ('release_vehicle', $$ public.release_vehicle(tests.val('release_task'), now(), 20.66, -103.35, 'Guadalajara',
       'Jalisco', null) $$),
  ('report_incident', $$ public.report_incident(tests.val('trip'), 'delay', 'x', now(), null, null) $$),
  ('resolve_incident', $$ public.resolve_incident(tests.val('incident'), 'x') $$),
  ('trip_point_locations', $$ (select count(*) from public.trip_point_locations(tests.val('trip'))) $$),
  ('add_trip_document', $$ public.add_trip_document(tests.val('trip'), 'carta_porte',
       tests.val('trip') || '/a2400000-0000-4000-8000-000000000003.pdf', 'carta.pdf') $$),
  ('shipper_trip_parties', $$ (select count(*) from public.shipper_trip_parties(array[tests.val('trip')])) $$),
  ('trip_shared_documents', $$ (select count(*) from public.trip_shared_documents(tests.val('trip'))) $$),
  ('revoke_document_share', $$ public.revoke_document_share(tests.val('share')) $$),
  ('set_provider_status', $$ public.set_provider_status(tests.val('carrier_company'), 'revoked', null) $$),
  ('send_message', $$ public.send_message(tests.val('trip_conversation'), 'hola', '[]', null) $$),
  ('send_message', $$ public.send_message(tests.val('negotiation_conversation'), 'hola', '[]', null) $$),
  ('mark_conversation_read', $$ public.mark_conversation_read(tests.val('trip_conversation'), null) $$),
  ('is_conversation_participant', $$ public.is_conversation_participant(tests.val('trip_conversation')) $$),
  -- H1: the carrier's internal chat of T1.
  ('send_message', $$ public.send_message(tests.val('internal_conversation'), 'hola', '[]', null) $$),
  ('mark_conversation_read', $$ public.mark_conversation_read(tests.val('internal_conversation'), null) $$),
  ('is_conversation_participant', $$ public.is_conversation_participant(tests.val('internal_conversation')) $$),
  ('unregister_push_token', $$ public.unregister_push_token('ExponentPushToken[b24SeedDeviceToken]') $$),
  ('mark_notifications_read', $$ public.mark_notifications_read(array(select id from tests.foreign_notifications)) $$),
  -- Share links (G7): a load the outsiders do not see (contracted), the
  -- seed's trip, the fixture link and tokens that match nothing.
  ('create_share_link', $$ (select count(*) from public.create_share_link('load_internal', tests.val('contracted_load'), null, null)) $$),
  ('create_share_link', $$ (select count(*) from public.create_share_link('load_public', tests.val('open_load'), null, null)) $$),
  ('create_share_link', $$ (select count(*) from public.create_share_link('trip_tracking_public', null, tests.val('trip'), null)) $$),
  ('revoke_share_link', $$ public.revoke_share_link(tests.val('share_link')) $$),
  ('open_internal_share', $$ public.open_internal_share('B24SHARETOKEN') $$),
  ('public_shared_load', $$ public.public_shared_load('B24SHARETOKEN') $$),
  ('public_shared_trip', $$ public.public_shared_trip('B24SHARETOKEN') $$),
  -- Road catalog (H4): admins only.
  ('admin_upsert_road_segment', $$ public.admin_upsert_road_segment('SLP-LAG', 'Ajeno', 'San Luis Potosí', 'San Luis Potosí', 22.1565, -100.9855, 'Lagos de Moreno', 'Jalisco', 21.3564, -101.9356, 172, true, 'x', current_date, 'verified', tests.val('road_segment'), null, null, null) $$),
  ('admin_set_segment_toll', $$ public.admin_set_segment_toll(tests.val('road_segment'), 'c5', 'x', current_date, 'verified', 1, null) $$),
  ('admin_upsert_segment_risk', $$ public.admin_upsert_segment_risk(tests.val('road_segment'), 'high', 0::smallint, 24::smallint, 'x', 'x', current_date, 'verified', tests.val('road_risk'), null, true) $$),
  ('admin_upsert_corridor', $$ public.admin_upsert_corridor('MTY-GDL-SLP', 'Ajeno', 'Monterrey', 'Nuevo León', 25.6866, -100.3161, 60, 'Guadalajara', 'Jalisco', 20.6597, -103.3496, 60, true, array[tests.val('road_segment')], tests.val('road_corridor'), true) $$),
  -- Subscription (H3): another company's state, and the admin RPCs.
  ('company_billing_state', $$ (select count(*) from public.company_billing_state(tests.val('carrier_company'))) $$),
  ('admin_set_platform_setting', $$ public.admin_set_platform_setting('billing.pilot_mode', 'false') $$),
  ('admin_update_subscription_plan', $$ public.admin_update_subscription_plan(
       (select id from public.subscription_plans where code = 'fleet_monthly'), 'Ajeno', null, 100, null, true) $$),
  -- Estimated end of a trip (H5): whoever sees the trip.
  ('trip_estimated_end', $$ (select count(*) from public.trip_estimated_end(tests.val('trip'))) $$);

-- The seed's notifications, captured as the owner: the outsider cannot read
-- them (notifications_select_own), so the call must get their ids from here.
create table tests.foreign_notifications as
  select id from public.notifications where user_id::text not like 'b2400000-%';
grant select on tests.foreign_notifications to authenticated;
select ok(
  exists (select 1 from tests.foreign_notifications where id is not null),
  'the RPC matrix has notifications of other users to mark'
);

-- RPCs without a foreign target: they act on the caller's own rows only
-- (reviewed in docs/seguridad.md). register_push_token reassigns a token to
-- the device's current user by design. invitation_preview (G1b) is public by
-- design: the token is the credential, and it returns no id (29_invitations
-- covers the guessed, expired, used and revoked tokens).
create table tests.self_scoped (fn text);
insert into tests.self_scoped values
  ('auth_role'), ('auth_company_id'), ('auth_shipper_company_id'), ('auth_fleet_company_id'), ('auth_operator_id'),
  ('is_admin'), ('is_company_approved'), ('has_location_consent'), ('create_company'), ('register_company'),
  ('request_company_review'),
  ('auth_carrier_company_id'), ('auth_is_manager'), ('auth_business_unit_ids'), ('can_operate_unit'),
  ('coordinator_runs_document_owner'), ('conversation_business_unit_id'),
  ('create_load'), ('record_location_consent'), ('revoke_location_consent'), ('register_push_token'),
  ('consume_rate_limit'), ('track_product_event'), ('invitation_preview'),
  -- G4: creates a business unit in the caller's own company (the Gerente's).
  ('create_business_unit'),
  -- H5: a site's typical time from the caller's own trips (others' only from
  -- 2 carriers up; 46_site_dwell); a site without them answers the default.
  ('site_dwell_estimate');

select set_eq(
  $$ select fn from tests.rpc_calls union select fn from tests.self_scoped $$,
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'every client RPC is in the RPC matrix or on the reviewed self-scoped list'
);

-- Fingerprint of every table of the matrix (as the database owner).
create function tests.db_hash()
returns text
language plpgsql
as $$
declare
  v_tbl text;
  v_part text;
  v_all text := '';
begin
  for v_tbl in select tbl from tests.ownership order by tbl loop
    execute format('select md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from %s x', ',', '', v_tbl)
    into v_part;
    v_all := v_all || v_part;
  end loop;
  return md5(v_all);
end;
$$;

-- Calls that succeeded and changed data or returned something. Each call is
-- rolled back.
create function tests.rpc_breaches(p_uid uuid)
returns setof text
language plpgsql
as $$
declare
  r record;
  v_before text;
  v_result text;
  v_breach text;
begin
  for r in select fn, call from tests.rpc_calls order by fn, call loop
    v_breach := null;
    v_before := tests.db_hash();
    begin
      perform tests.act_as(p_uid);
      execute format('select (%s)::text', r.call) into v_result;
      reset role;
      if tests.db_hash() <> v_before then
        v_breach := r.fn || ' changed data';
      elsif coalesce(v_result, '') not in ('', 'false', '0') then
        v_breach := r.fn || ' returned ' || left(v_result, 80);
      end if;
      raise exception 'b24_rollback';
    exception
      -- The expected refusal.
      when insufficient_privilege then
        v_breach := null;
      when others then
        -- Any other error (a missing function, a wrong argument, a broken
        -- fixture) means the call never reached its access check: report it
        -- instead of counting it as a refusal.
        if sqlerrm <> 'b24_rollback' then
          v_breach := r.fn || ' failed with ' || sqlstate || ' instead of 42501: ' || left(sqlerrm, 80);
        end if;
    end;
    reset role;
    if v_breach is not null then
      return next v_breach;
    end if;
  end loop;
end;
$$;

select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000001') $$,
  'RPCs: an outsider shipper cannot act on or read the seed''s rows');
select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000002') $$,
  'RPCs: an outsider carrier cannot act on or read the seed''s rows');
select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000003') $$,
  'RPCs: an outsider operator cannot act on or read the seed''s rows');
select is_empty($$ select * from tests.rpc_breaches('b2400000-0000-4000-8000-000000000004') $$,
  'RPCs: an operator without a company cannot act on or read the seed''s rows (nor take someone else''s invitation)');

-- The coordinator of another business unit of the same company (Héctor,
-- "Regional Monterrey") on the rows of "Corredor MTY–GDL": unit CS53-01, trip T1
-- with Pedro López, their conversations and offers.
create function tests.rpc_breaches_of(p_uid uuid, p_fns text[])
returns setof text
language plpgsql
as $$
declare
  v_saved tests.rpc_calls[] := array(select r from tests.rpc_calls r);
begin
  delete from tests.rpc_calls where not (fn = any (p_fns));
  return query select * from tests.rpc_breaches(p_uid);
  delete from tests.rpc_calls;
  insert into tests.rpc_calls select * from unnest(v_saved);
end;
$$;

select is_empty(
  $$ select * from tests.rpc_breaches_of('5eed0001-0000-4000-8000-000000000012', array[
       'set_vehicle_availability', 'clear_vehicle_availability', 'assign_trip', 'cancel_trip', 'report_incident',
       'add_trip_document', 'trip_point_locations', 'send_message', 'mark_conversation_read',
       'is_conversation_participant', 'make_offer', 'counter_offer', 'reject_offer', 'withdraw_offer', 'accept_offer',
       'create_invitation', 'revoke_invitation', 'create_share_link',
       'trip_shared_documents', 'revoke_document_share', 'trip_estimated_end',
       'vehicle_release_context', 'release_vehicle', 'rename_business_unit', 'archive_business_unit',
       'set_coordinator_units', 'remove_company_member', 'move_vehicle_to_unit', 'move_operator_to_unit']) $$,
  'RPCs: the coordinator of another business unit cannot act on the rows of a business unit'
);

-- Sanity check of the harness: the same call by the right party does change
-- data, so a refusal above is not an artifact of the fixtures.
create function tests.changes_data(p_uid uuid, p_call text)
returns boolean
language plpgsql
as $$
declare
  v_before text := tests.db_hash();
  v_changed boolean;
begin
  begin
    perform tests.act_as(p_uid);
    execute format('select (%s)::text', p_call);
    reset role;
    v_changed := tests.db_hash() <> v_before;
    raise exception 'b24_rollback';
  exception when others then
    if sqlerrm <> 'b24_rollback' then
      raise;
    end if;
  end;
  reset role;
  return v_changed;
end;
$$;

select ok(
  tests.changes_data('5eed0001-0000-4000-8000-000000000008', (select call from tests.rpc_calls where fn = 'report_incident')),
  'harness: the trip''s operator can report the incident the outsiders could not'
);

select ok(
  tests.changes_data('5eed0001-0000-4000-8000-000000000011', (select call from tests.rpc_calls where fn = 'set_vehicle_availability')),
  'harness: the coordinator of the unit''s business unit can set the availability Héctor could not'
);
select ok(
  tests.changes_data('5eed0001-0000-4000-8000-000000000005', (select call from tests.rpc_calls where fn = 'set_vehicle_availability')),
  'harness: the manager can set it too'
);
select ok(
  tests.changes_data('5eed0001-0000-4000-8000-000000000011',
                     (select call from tests.rpc_calls where fn = 'create_invitation' and call like '%''operator'', array%')),
  'harness: the coordinator of the business unit can invite the operator Héctor could not'
);
select ok(
  tests.changes_data('5eed0001-0000-4000-8000-000000000005', (select call from tests.rpc_calls where fn = 'revoke_document_share')),
  'harness: the manager can revoke the share the outsiders could not'
);
select ok(
  tests.changes_data('5eed0001-0000-4000-8000-000000000002', (select call from tests.rpc_calls where fn = 'set_provider_status')),
  'harness: the shipper of the pair can revoke the provider approval'
);

select * from finish();
rollback;
