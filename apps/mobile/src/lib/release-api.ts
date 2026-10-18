import {
  mobileErrorCopy,
  releaseErrorText,
  unitLabel,
  vehicleReleaseCopy,
  type LatLng,
  type ReleaseFormValues,
} from '@transport/shared';

import { toErrorKey } from './errors';
import type { Supabase } from './supabase';

// Release of a unit whose trip was cancelled after it set off (G5, D20).
// RLS of vehicle_release_tasks limits the reads to the Gerente and the
// Coordinador of the unit's business unit; only release_vehicle writes.

/** Throws the error of a PostgREST response, or returns its data. */
function check<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

/** PostgREST caps each response (1,000 rows by default). */
const PAGE_SIZE = 1000;

/** A unit waiting for its release, as the home card lists it. */
export interface PendingRelease {
  taskId: string;
  vehicleId: string;
  unit: string;
  route: string;
}

interface PendingRow {
  id: string;
  vehicle_id: string;
  vehicle: { plate: string; fleet_number: string | null; archived_at: string | null } | null;
  trip: { load: { origin_city: string; destination_city: string } | null } | null;
}

/** Pending releases of the units the user runs, oldest first. */
export async function listPendingReleases(
  client: Supabase,
  companyId: string,
): Promise<PendingRelease[]> {
  // Filtered in the query (inner join), then read page by page: at most one
  // pending task per unit, so this is every unit waiting, never a prefix.
  const rows: PendingRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = check(
      await client
        .from('vehicle_release_tasks')
        .select(
          `id, vehicle_id,
           vehicle:vehicles!vehicle_release_tasks_vehicle_fkey!inner(plate, fleet_number, archived_at),
           trip:trips!vehicle_release_tasks_trip_id_fkey(load:loads!trips_load_id_fkey(origin_city, destination_city))`,
        )
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .is('vehicle.archived_at', null)
        .order('created_at')
        .order('id')
        .range(from, from + PAGE_SIZE - 1),
    ) as unknown as PendingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.flatMap((row) =>
    row.vehicle && !row.vehicle.archived_at
      ? [
          {
            taskId: row.id,
            vehicleId: row.vehicle_id,
            unit: unitLabel(row.vehicle),
            route: row.trip?.load
              ? `${row.trip.load.origin_city} → ${row.trip.load.destination_city}`
              : '',
          },
        ]
      : [],
  );
}

/** What the release form shows first (vehicle_release_context). */
export interface ReleaseContext {
  taskId: string;
  last: (LatLng & { at: string }) | null;
  origin: LatLng & { city: string };
  destination: LatLng & { city: string };
}

/** The pending release of one unit, or null when it is not waiting. */
export async function getReleaseContext(
  client: Supabase,
  vehicleId: string,
): Promise<ReleaseContext | null> {
  const task = await client
    .from('vehicle_release_tasks')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'pending')
    .maybeSingle();
  if (task.error) throw task.error;
  if (!task.data) return null;
  const { data, error } = await client
    .rpc('vehicle_release_context', { p_task_id: task.data.id })
    .maybeSingle();
  if (error) throw error;
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

/** Releases the unit (release_vehicle): where the truck is and from when it is free. */
export async function releaseVehicle(
  client: Supabase,
  taskId: string,
  values: ReleaseFormValues,
): Promise<void> {
  const { error } = await client.rpc('release_vehicle', {
    p_task_id: taskId,
    p_available_from: values.availableFrom,
    p_latitude: values.latitude,
    p_longitude: values.longitude,
    p_city: values.city,
    p_state: values.state,
    p_notes: values.notes ?? undefined,
  });
  if (error) throw error;
}

/** Spanish message for an error of the release, never the server's text. */
export function releaseErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const known = releaseErrorText(message);
  if (known) return known;
  const key = toErrorKey(error);
  return key === 'unknown' ? vehicleReleaseCopy.errors.generic : mobileErrorCopy[key];
}
