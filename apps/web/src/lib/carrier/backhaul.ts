import 'server-only';

import {
  backhaulSuggestions,
  isBackhaulTripStatus,
  type Recommendation,
  type TripStatus,
} from '@transport/shared';

import type { Supabase } from '../viewer';
import { unitRecommendations } from './loads';

// "Para el regreso" of a trip in progress (I7, D40): once Postgres checked the
// trip (on arrival or within 50 km of the destination) and while it still ends
// its unit's chain of trips (trip_backhaul, only for the staff of its business
// unit), the best return loads of its unit, from the same recommendations as
// the home feed. Once the unit wins its next trip its recommendations start
// where that one ends, so they are not shown here.

export interface TripBackhaul {
  /** When the unit is free at the destination (null when unknown). */
  availableFrom: string | null;
  suggestions: Recommendation[];
}

export async function tripBackhaul(
  supabase: Supabase,
  trip: { id: string; status: TripStatus; vehicle_id: string | null },
): Promise<TripBackhaul | null> {
  if (!trip.vehicle_id || !isBackhaulTripStatus(trip.status)) return null;
  const [check, vehicle] = await Promise.all([
    supabase.rpc('trip_backhaul', { p_trip_id: trip.id }).maybeSingle(),
    supabase
      .from('vehicles')
      .select('id, kind, unit_type, axle_count')
      .eq('id', trip.vehicle_id)
      .maybeSingle(),
  ]);
  if (check.error) throw new Error(check.error.message);
  if (vehicle.error) throw new Error(vehicle.error.message);
  if (!check.data || !vehicle.data) return null;
  const { recommendations } = await unitRecommendations(supabase, vehicle.data);
  return {
    availableFrom: check.data.available_from,
    suggestions: backhaulSuggestions(vehicle.data.id, recommendations),
  };
}
