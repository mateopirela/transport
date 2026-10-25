'use server';

import {
  authErrors,
  tripLinkCopy,
  tripLinkErrorText,
  tripLinkPath,
  uuidField,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { siteUrl } from '../env';
import type { FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';

// Server actions of "Enviar viaje al operador" (H2, D29) on the carrier's trip
// screen. create_trip_operator_link and revoke_share_link check the actor,
// the business unit and the trip again; the actions only shape the answer.

const c = tripLinkCopy;
const notConfigured: FormState = { error: authErrors.notConfigured };

function uuidOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

function done(state: FormState): FormState {
  // The active link of the trip screen changes.
  revalidatePath(paths.carrier, 'layout');
  return state;
}

/**
 * Issues the trip link (revoking the previous one). The token comes back once
 * and is shown as the absolute URL of /viaje/<token>; it is never stored.
 */
export async function createTripOperatorLink(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tripId = uuidOf(formData, 'tripId');
  if (!tripId) return { error: c.errors.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('create_trip_operator_link', { p_trip_id: tripId });
  if (error) return { error: tripLinkErrorText(error.code) };
  const link = data[0];
  if (!link) return { error: c.errors.generic };
  const origin = (await headers()).get('origin');
  return done({
    message: c.send.created,
    values: {
      // The panel shows the URL only while this link is still the live one.
      linkId: link.id,
      url: `${siteUrl(origin)}${tripLinkPath(link.token)}`,
      expiresAt: link.expires_at,
    },
  });
}

/** Revokes the live trip link (revoke_share_link checks it is the unit's). */
export async function revokeTripOperatorLink(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = uuidOf(formData, 'linkId');
  if (!id) return { error: c.errors.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('revoke_share_link', { p_id: id });
  if (error) return { error: tripLinkErrorText(error.code) };
  return done({ message: c.send.revoked });
}
