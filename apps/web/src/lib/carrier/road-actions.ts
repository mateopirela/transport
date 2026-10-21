'use server';

import { authErrors, carrierWebCopy, roadsCopy, uuidField } from '@transport/shared';
import { revalidatePath } from 'next/cache';

import type { FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';

// Road preferences of the carrier (H4): set_carrier_road_preference replaces
// the active preference of a route and segment (security invoker: the RLS of
// carrier_road_preferences decides who may write it).

const PREFERENCE_VALUES = new Set(['prefer', 'avoid', 'clear']);

export async function setRoadPreference(_prev: FormState, formData: FormData): Promise<FormState> {
  const routeId = uuidField.safeParse(formData.get('routeId'));
  const segmentId = uuidField.safeParse(formData.get('segmentId'));
  const preference = String(formData.get('preference') ?? '');
  if (!routeId.success || !PREFERENCE_VALUES.has(preference)) {
    return { error: carrierWebCopy.fleet.errors.generic };
  }
  if (!segmentId.success) {
    return { fieldErrors: { segmentId: roadsCopy.preferences.segmentRequired } };
  }
  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  // Without a preference the RPC clears (archives) the active one.
  const { error } = await supabase.rpc('set_carrier_road_preference', {
    p_carrier_route_id: routeId.data,
    p_segment_id: segmentId.data,
    ...(preference === 'clear' ? {} : { p_preference: preference as 'prefer' | 'avoid' }),
  });
  if (error) return { error: carrierWebCopy.fleet.errors.generic };
  // The routes screen, the load details and the recommendations change.
  revalidatePath(paths.carrier, 'layout');
  return {
    message: preference === 'clear' ? roadsCopy.preferences.removed : roadsCopy.preferences.saved,
  };
}
