'use server';

import {
  authErrors,
  parseShareValidityHours,
  shareLinksCopy,
  sharePath,
  uuidField,
  type ShareLinkKind,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { siteUrl } from '../env';
import type { FormState } from '../forms';
import { paths } from '../routing';
import { createClient } from '../supabase/server';
import { shareErrorMessage } from './errors';

const c = shareLinksCopy;
const notConfigured: FormState = { error: authErrors.notConfigured };

/** The kinds the shipper's dialog creates; the internal one belongs to the app. */
const SHIPPER_KINDS = ['load_public', 'trip_tracking_public'] as const satisfies ShareLinkKind[];
type ShipperKind = (typeof SHIPPER_KINDS)[number];

function kindOf(formData: FormData): ShipperKind | null {
  const value = formData.get('kind');
  return SHIPPER_KINDS.find((kind) => kind === value) ?? null;
}

/** A uuid from a hidden input; anything malformed is treated as not found. */
function uuidOf(formData: FormData, name: string): string | null {
  const parsed = uuidField.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

function done(state: FormState): FormState {
  // The list of active links on the load or trip screen changes.
  revalidatePath(paths.shipper, 'layout');
  return state;
}

/**
 * Creates a public link (create_share_link decides who may share what and
 * for how long). The token comes back once and is shown to the user as an
 * absolute URL; it is never stored, so a closed dialog cannot show it again.
 */
export async function createShareLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const kind = kindOf(formData);
  const targetId = uuidOf(formData, 'targetId');
  if (!kind || !targetId) return { error: c.errors.notFound };
  const hours = parseShareValidityHours(formData.get('hours'));
  if (hours === null) return { fieldErrors: { hours: c.errors.invalidValidity } };

  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('create_share_link', {
    p_kind: kind,
    p_load_id: kind === 'load_public' ? targetId : undefined,
    p_trip_id: kind === 'trip_tracking_public' ? targetId : undefined,
    p_valid_for_hours: hours,
  });
  if (error) return { error: shareErrorMessage(error) };
  const link = data[0];
  if (!link) return { error: c.errors.generic };

  const origin = (await headers()).get('origin');
  return done({
    message: c.dialog.created,
    values: { url: `${siteUrl(origin)}${sharePath(kind, link.token)}`, expiresAt: link.expires_at },
  });
}

/** Revokes a link of the company (revoke_share_link checks it is theirs). */
export async function revokeShareLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidOf(formData, 'linkId');
  if (!id) return { error: c.errors.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('revoke_share_link', { p_id: id });
  if (error) return { error: shareErrorMessage(error) };
  return done({ message: c.dialog.revoked });
}
