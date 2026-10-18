import 'server-only';

import { unitLabel, uuidField } from '@transport/shared';

import type { Supabase } from '../viewer';

// Reads of the release of a unit whose trip was cancelled after it set off
// (G5, D20). RLS of vehicle_release_tasks limits them to the Gerente and the
// Coordinador of the unit's business unit; the release itself happens only
// through release_vehicle (release-actions.ts).

/** A unit waiting for its release, as the home card lists it. */
export interface PendingRelease {
  taskId: string;
  vehicleId: string;
  unit: string;
  route: string;
  createdAt: string;
}

interface PendingRow {
  id: string;
  vehicle_id: string;
  created_at: string;
  vehicle: {
    plate: string;
    fleet_number: string | null;
    business_unit_id: string;
    archived_at: string | null;
  } | null;
  trip: { load: { origin_city: string; destination_city: string } | null } | null;
}

/** Pending releases of the units of the given business units (the picker's selection), oldest first. */
export async function listPendingReleases(
  supabase: Supabase,
  companyId: string,
  businessUnitIds: readonly string[],
): Promise<PendingRelease[]> {
  if (businessUnitIds.length === 0) return [];
  const { data, error } = await supabase
    .from('vehicle_release_tasks')
    .select(
      `id, vehicle_id, created_at,
       vehicle:vehicles!vehicle_release_tasks_vehicle_fkey(plate, fleet_number, business_unit_id, archived_at),
       trip:trips!vehicle_release_tasks_trip_id_fkey(load:loads!trips_load_id_fkey(origin_city, destination_city))`,
    )
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .order('created_at')
    .limit(100);
  if (error) throw new Error(`Release tasks query failed: ${error.message}`);
  const selected = new Set(businessUnitIds);
  return ((data ?? []) as unknown as PendingRow[]).flatMap((row) =>
    row.vehicle && !row.vehicle.archived_at && selected.has(row.vehicle.business_unit_id)
      ? [
          {
            taskId: row.id,
            vehicleId: row.vehicle_id,
            unit: unitLabel(row.vehicle),
            route: row.trip?.load
              ? `${row.trip.load.origin_city} → ${row.trip.load.destination_city}`
              : '',
            createdAt: row.created_at,
          },
        ]
      : [],
  );
}

/** What the release form of a unit shows first (vehicle_release_context). */
export interface ReleaseContext {
  taskId: string;
  last: { lat: number; lng: number; at: string } | null;
  origin: { lat: number; lng: number; city: string };
  destination: { lat: number; lng: number; city: string };
}

/** The pending release of one unit, or null when it is not waiting (or not the viewer's). */
export async function getPendingRelease(
  supabase: Supabase,
  vehicleId: string,
): Promise<ReleaseContext | null> {
  if (!uuidField.safeParse(vehicleId).success) return null;
  const task = await supabase
    .from('vehicle_release_tasks')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'pending')
    .maybeSingle();
  if (task.error) throw new Error(`Release task query failed: ${task.error.message}`);
  if (!task.data) return null;
  const { data, error } = await supabase
    .rpc('vehicle_release_context', { p_task_id: task.data.id })
    .maybeSingle();
  if (error) throw new Error(`Release context failed: ${error.message}`);
  if (!data) return null;
  // Null when the trip recorded no point (the generated types say otherwise).
  const lat = data.last_latitude as number | null;
  const lng = data.last_longitude as number | null;
  const at = data.last_known_at as string | null;
  return {
    taskId: data.task_id,
    last: lat !== null && lng !== null && at !== null ? { lat, lng, at } : null,
    origin: { lat: data.origin_lat, lng: data.origin_lng, city: data.origin_city },
    destination: {
      lat: data.destination_lat,
      lng: data.destination_lng,
      city: data.destination_city,
    },
  };
}
