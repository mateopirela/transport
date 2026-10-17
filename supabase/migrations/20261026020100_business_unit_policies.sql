-- G1a.2 · Policies by business unit (follow-up of the previous migration).
--   Every policy keeps the manager's access as it is (the company through
--   auth_fleet_company_id) and adds the coordinator's: the rows of their
--   business units, through auth_business_unit_ids. Policies on trip_events,
--   trip_evidence, trip_documents, incidents, messages, message_reads and the
--   chat and evidence buckets read through trips or conversations, so they
--   follow these without changes. Same as their last version otherwise.

-- The business unit of a conversation: the one of its negotiation, or of its
-- trip (which moves with the assigned unit). security definer so the chat
-- policies do not depend on the RLS of negotiations and trips; null unless the
-- caller is staff of the conversation's carrier.
create function public.conversation_business_unit_id(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(n.business_unit_id, t.business_unit_id)
  from public.conversations c
  left join public.negotiations n on n.id = c.negotiation_id
  left join public.trips t on t.id = c.trip_id
  where c.id = p_conversation_id
    and c.carrier_company_id = public.auth_carrier_company_id();
$$;

revoke all on function public.conversation_business_unit_id(uuid) from public, anon;
grant execute on function public.conversation_business_unit_id(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fleet (20261015060000_fleet.sql, vehicles_select from 20261015180000_trips.sql)
-- ---------------------------------------------------------------------------
drop policy vehicles_select on public.vehicles;
create policy vehicles_select
on public.vehicles
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  or (current_operator_id is not null and current_operator_id = (select public.auth_operator_id()))
  or (select public.is_admin())
  or (
    (select public.auth_operator_id()) is not null
    and exists (
      select 1 from public.trips t
      where t.vehicle_id = vehicles.id
        and t.operator_id = (select public.auth_operator_id())
        and public.trip_in_operator_hands(t.status)
    )
  )
);

-- vehicles_insert stays the manager's (auth_fleet_company_id).

drop policy vehicles_update on public.vehicles;
create policy vehicles_update
on public.vehicles
for update
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
)
with check (
  company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
);

drop policy operators_select on public.operators;
create policy operators_select
on public.operators
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  or profile_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy operators_insert on public.operators;
create policy operators_insert
on public.operators
for insert
to authenticated
with check (
  (
    company_id = (select public.auth_fleet_company_id())
    or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  )
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy operators_update on public.operators;
create policy operators_update
on public.operators
for update
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
)
with check (
  company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
);

drop policy operator_invitations_select on public.operator_invitations;
create policy operator_invitations_select
on public.operator_invitations
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or exists (
    select 1 from public.operators o
    where o.id = operator_invitations.operator_id
      and o.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  )
  or (select public.is_admin())
);

drop policy vehicle_availability_select on public.vehicle_availability;
create policy vehicle_availability_select
on public.vehicle_availability
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or exists (
    select 1 from public.vehicles v
    where v.id = vehicle_availability.vehicle_id
      and v.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  )
  or (select public.is_admin())
);

-- The usual routes stay a company matter, now read and written by the manager
-- and the coordinators.
drop policy carrier_routes_select on public.carrier_routes;
create policy carrier_routes_select
on public.carrier_routes
for select
to authenticated
using (
  company_id = (select public.auth_carrier_company_id())
  or (select public.is_admin())
);

drop policy carrier_routes_insert on public.carrier_routes;
create policy carrier_routes_insert
on public.carrier_routes
for insert
to authenticated
with check (company_id = (select public.auth_carrier_company_id()));

drop policy carrier_routes_update on public.carrier_routes;
create policy carrier_routes_update
on public.carrier_routes
for update
to authenticated
using (company_id = (select public.auth_carrier_company_id()))
with check (company_id = (select public.auth_carrier_company_id()));

-- ---------------------------------------------------------------------------
-- Loads and negotiations (20261015160000_loads_negotiation.sql, loads_select
-- from 20261015180000_trips.sql)
-- ---------------------------------------------------------------------------
drop policy negotiations_select on public.negotiations;
create policy negotiations_select
on public.negotiations
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  or (select public.is_admin())
);

drop policy offers_select on public.offers;
create policy offers_select
on public.offers
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or exists (
    select 1 from public.negotiations n
    where n.id = offers.negotiation_id
      and n.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  )
  or (select public.is_admin())
);

-- Published loads: every manager and coordinator of an approved carrier.
-- Negotiated ones: whoever sees the negotiation, or the trip (a trip the
-- manager moved to another business unit keeps its negotiation in the old one).
drop policy loads_select on public.loads;
create policy loads_select
on public.loads
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or (select public.is_admin())
  or (
    (select public.auth_carrier_company_id()) is not null
    and (
      (
        status in ('published', 'negotiating')
        and archived_at is null
        and (select public.is_company_approved())
      )
      or (
        (carrier_company_id is null or carrier_company_id = (select public.auth_carrier_company_id()))
        and exists (
          select 1 from public.negotiations n
          where n.load_id = loads.id
            and n.carrier_company_id = (select public.auth_carrier_company_id())
            and (
              n.carrier_company_id = (select public.auth_fleet_company_id())
              or n.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
            )
        )
      )
      or (
        carrier_company_id = (select public.auth_carrier_company_id())
        and exists (
          select 1 from public.trips t
          where t.load_id = loads.id
            and t.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
        )
      )
    )
  )
  or (
    (select public.auth_operator_id()) is not null
    and exists (
      select 1 from public.trips t
      where t.load_id = loads.id and t.operator_id = (select public.auth_operator_id())
    )
  )
);

-- ---------------------------------------------------------------------------
-- Trips (20261015180000_trips.sql)
-- ---------------------------------------------------------------------------
drop policy trips_select on public.trips;
create policy trips_select
on public.trips
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  or (operator_id is not null and operator_id = (select public.auth_operator_id()))
  or (select public.is_admin())
);

drop policy trip_locations_select on public.trip_locations;
create policy trip_locations_select
on public.trip_locations
for select
to authenticated
using (
  exists (
    select 1 from public.trips t
    where t.id = trip_locations.trip_id
      and (
        t.carrier_company_id = (select public.auth_fleet_company_id())
        or t.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
        or (t.operator_id is not null and t.operator_id = (select public.auth_operator_id()))
        or (select public.is_admin())
        or (t.shipper_company_id = (select public.auth_shipper_company_id()) and public.trip_is_active(t.status))
      )
  )
);

drop policy trip_documents_bucket_insert_carrier on storage.objects;
create policy trip_documents_bucket_insert_carrier
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trip-documents'
  and objects.name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$'
  )
  and exists (
    select 1 from public.trips t
    where t.id::text = split_part(objects.name, '/', 1)
      and (
        t.carrier_company_id = (select public.auth_fleet_company_id())
        or t.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
      )
      and t.status <> 'cancelled'
  )
);

-- ---------------------------------------------------------------------------
-- Chat (20261015200000_chat_notifications.sql)
-- ---------------------------------------------------------------------------
drop policy conversations_select on public.conversations;
create policy conversations_select
on public.conversations
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or (
    carrier_company_id = (select public.auth_carrier_company_id())
    and public.conversation_business_unit_id(id) = any ((select public.auth_business_unit_ids())::uuid[])
  )
  or (select public.is_admin())
  or (
    trip_id is not null
    and (select public.auth_operator_id()) is not null
    and exists (
      select 1 from public.trips t
      where t.id = conversations.trip_id and t.operator_id = (select public.auth_operator_id())
    )
  )
);

-- Same as 20261015200000_chat_notifications.sql, plus the coordinators of the
-- conversation's business unit.
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.trips t on t.id = c.trip_id
    where c.id = p_conversation_id
      and (
        c.shipper_company_id = public.auth_shipper_company_id()
        or c.carrier_company_id = public.auth_fleet_company_id()
        or (
          c.carrier_company_id = public.auth_carrier_company_id()
          and public.conversation_business_unit_id(c.id) = any (public.auth_business_unit_ids())
        )
        or (t.operator_id is not null and t.operator_id = public.auth_operator_id())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Documents (20261015050000_documents_verification.sql). The company's
-- documents: the manager reads and writes them, a coordinator reads them. The
-- documents of a unit or an operator: also the coordinators of its business
-- unit, who may upload them too.
-- ---------------------------------------------------------------------------

-- Whether a coordinator of the caller's company runs the owner of a document.
create function public.coordinator_runs_document_owner(p_owner_type public.document_owner_type, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_role() = 'coordinator'
    and case p_owner_type
      when 'vehicle' then exists (
        select 1 from public.vehicles v
        where v.id = p_owner_id and v.business_unit_id = any (public.auth_business_unit_ids())
      )
      when 'operator' then exists (
        select 1 from public.operators o
        where o.id = p_owner_id and o.business_unit_id = any (public.auth_business_unit_ids())
      )
      else false
    end;
$$;

revoke all on function public.coordinator_runs_document_owner(public.document_owner_type, uuid) from public, anon;
grant execute on function public.coordinator_runs_document_owner(public.document_owner_type, uuid)
  to authenticated, service_role;

drop policy documents_select_own_company_or_admin on public.documents;
create policy documents_select_own_company_or_admin
on public.documents
for select
to authenticated
using (
  (
    company_id = (select public.auth_company_id())
    and (select public.auth_role()) in ('shipper', 'manager')
  )
  or (
    company_id = (select public.auth_carrier_company_id())
    and (select public.auth_role()) = 'coordinator'
    and (owner_type = 'company' or public.coordinator_runs_document_owner(owner_type, owner_id))
  )
  or (select public.is_admin())
);

drop policy documents_bucket_insert_own_company on storage.objects;
create policy documents_bucket_insert_own_company
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and name ~ (
    '^' || (select public.auth_company_id())::text
    || '/(company|vehicle|operator)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$'
  )
  and (
    (
      (select public.auth_role()) in ('shipper', 'manager')
      and (
        split_part(name, '/', 2) <> 'company'
        or split_part(name, '/', 3) = (select public.auth_company_id())::text
      )
    )
    or (
      (select public.auth_carrier_company_id()) is not null
      and split_part(name, '/', 2) in ('vehicle', 'operator')
      and public.coordinator_runs_document_owner(
        split_part(name, '/', 2)::public.document_owner_type, split_part(name, '/', 3)::uuid
      )
    )
  )
  and exists (
    select 1 from public.companies c
    where c.id = (select public.auth_company_id()) and c.archived_at is null
  )
);

drop policy documents_bucket_select_own_company_or_admin on storage.objects;
create policy documents_bucket_select_own_company_or_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (
    (
      split_part(name, '/', 1) = (select public.auth_company_id())::text
      and (select public.auth_role()) in ('shipper', 'manager')
    )
    or (
      split_part(name, '/', 1) = (select public.auth_carrier_company_id())::text
      and (select public.auth_role()) = 'coordinator'
      and (
        split_part(name, '/', 2) = 'company'
        or (
          split_part(name, '/', 2) in ('vehicle', 'operator')
          and split_part(name, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and public.coordinator_runs_document_owner(
            split_part(name, '/', 2)::public.document_owner_type, split_part(name, '/', 3)::uuid
          )
        )
      )
    )
    or (select public.is_admin())
  )
);
