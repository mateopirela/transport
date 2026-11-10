import {
  backhaulSuggestions,
  isBackhaulTripStatus,
  type Recommendation,
  type TripStatus,
} from '@transport/shared';

import { unitRecommendations } from './loads-api';
import type { Supabase } from './supabase';

// "Para el regreso" of a trip in progress in the app (I7, D40), the same read
// as the carrier web (apps/web/src/lib/carrier/backhaul.ts): once Postgres
// checked the trip (trip_backhaul_checks, RLS: the staff of its business
// unit), the best return loads of its unit from the unit's recommendations.
// An extra of the screen: a failure answers null and the trip still shows.

export interface TripBackhaul {
  /** When the unit is free at the destination (null when unknown). */
  availableFrom: string | null;
  suggestions: Recommendation[];
}

export async function tripBackhaul(
  client: Supabase,
  trip: { id: string; status: TripStatus; vehicleId: string | null },
): Promise<TripBackhaul | null> {
  const { vehicleId } = trip;
  if (!vehicleId || !isBackhaulTripStatus(trip.status)) return null;
  try {
    const { data, error } = await client
      .from('trip_backhaul_checks')
      .select('available_from')
      .eq('trip_id', trip.id)
      .maybeSingle();
    if (error || !data) return null;
    const { recommendations } = await unitRecommendations(client, vehicleId);
    return {
      availableFrom: data.available_from,
      suggestions: backhaulSuggestions(vehicleId, recommendations),
    };
  } catch {
    return null;
  }
}
