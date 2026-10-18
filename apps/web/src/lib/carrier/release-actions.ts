'use server';

import {
  authErrors,
  releaseErrorText,
  releaseFormSchema,
  uuidField,
  vehicleReleaseCopy,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { formEntries, invalidForm, refillValues, type FormState } from '../forms';
import { withParams } from '../pagination';
import { carrierUnitPath, paths } from '../routing';
import { createClient } from '../supabase/server';
import { FLEET_FLASH_PARAM } from './fleet-forms';

// Server action of the release of a unit (G5, D20). Only release_vehicle
// writes: it checks that the viewer is the Gerente or a Coordinador of the
// unit's business unit, that the task is still pending and the place, under
// the unit lock.

function uuidOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

/**
 * Releases the unit where the carrier says the truck is, from when it is
 * free, and goes back to its screen, which reloads its recommendations.
 */
export async function releaseCarrierUnit(_prev: FormState, formData: FormData): Promise<FormState> {
  const taskId = uuidOf(formData, 'taskId');
  const vehicleId = uuidOf(formData, 'vehicleId');
  if (!taskId || !vehicleId) return { error: vehicleReleaseCopy.errors.notFound };
  const entries = formEntries(formData);
  const parsed = releaseFormSchema.safeParse({
    place: entries.place,
    cityId: entries.cityId,
    latitude: entries.latitude,
    longitude: entries.longitude,
    date: entries.date,
    time: entries.time,
    notes: entries.notes,
  });
  if (!parsed.success) return invalidForm(parsed.error, entries);
  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  const v = parsed.data;
  const { error } = await supabase.rpc('release_vehicle', {
    p_task_id: taskId,
    p_available_from: v.availableFrom,
    p_latitude: v.latitude,
    p_longitude: v.longitude,
    p_city: v.city,
    p_state: v.state,
    p_notes: v.notes ?? undefined,
  });
  if (error) {
    return {
      error: releaseErrorText(error.message) ?? vehicleReleaseCopy.errors.generic,
      values: refillValues(entries),
    };
  }
  // The fleet, the home card and the recommendations all change.
  revalidatePath(paths.carrier, 'layout');
  redirect(withParams(carrierUnitPath(vehicleId), {}, { [FLEET_FLASH_PARAM]: 'liberada' }));
}
