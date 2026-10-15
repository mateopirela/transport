'use server';

import { authErrors, loadsCopy, uuidField, validationMessages, type Json } from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { formEntries, refillValues, type FormState } from '../forms';
import { loadPath, paths } from '../routing';
import { createClient } from '../supabase/server';
import { loadErrorMessage } from './errors';
import { parseLoadForm } from './form';

const notConfigured: FormState = { error: authErrors.notConfigured };

/** Load id from a hidden input; anything malformed is treated as not found. */
function loadIdOf(formData: FormData): string | null {
  const parsed = uuidField.safeParse(formData.get('loadId'));
  return parsed.success ? parsed.data : null;
}

/**
 * Creates (as draft, optionally publishing it) or updates a load. The RPCs are
 * the authority: they check the shipper, the company status, the load status
 * and the payload again; this only validates for clear field errors.
 */
export async function saveLoad(_prev: FormState, formData: FormData): Promise<FormState> {
  const entries = formEntries(formData);
  const requirements = formData.getAll('specialRequirements').filter((v) => typeof v === 'string');
  const parsed = parseLoadForm(entries, requirements);
  if (!parsed.success) return { ...parsed.state, error: loadsCopy.form.fixErrors };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const payload = parsed.data as unknown as Json;
  const failed = (error: Parameters<typeof loadErrorMessage>[0]): FormState => ({
    error: loadErrorMessage(error),
    values: { ...refillValues(entries), specialRequirements: requirements.join(',') },
  });

  let loadId = loadIdOf(formData);
  let publishFailed = false;
  if (formData.has('loadId')) {
    if (!loadId) return { error: loadsCopy.errors.notFound };
    const { error } = await supabase.rpc('update_load', { p_load_id: loadId, p_load: payload });
    if (error) return failed(error);
  } else {
    const { data, error } = await supabase.rpc('create_load', { p_load: payload });
    if (error) return failed(error);
    loadId = data;
    if (entries.intent === 'publish') {
      // The draft exists already: on failure, show it instead of an error that
      // would invite a second submit (and a duplicate draft).
      const { error: publishError } = await supabase.rpc('publish_load', { p_load_id: loadId });
      publishFailed = publishError !== null;
    }
  }

  revalidatePath(paths.shipper, 'layout');
  redirect(publishFailed ? `${loadPath(loadId)}?aviso=no-publicada` : loadPath(loadId));
}

/** Publishes a draft (draft → published). */
export async function publishLoad(_prev: FormState, formData: FormData): Promise<FormState> {
  const loadId = loadIdOf(formData);
  if (!loadId) return { error: loadsCopy.errors.notFound };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('publish_load', { p_load_id: loadId });
  if (error) return { error: loadErrorMessage(error) };
  revalidatePath(paths.shipper, 'layout');
  return {};
}

/** Cancels a load that is not contracted yet; pending offers are rejected by the RPC. */
export async function cancelLoad(_prev: FormState, formData: FormData): Promise<FormState> {
  const loadId = loadIdOf(formData);
  if (!loadId) return { error: loadsCopy.errors.notFound };
  const reason = formData.get('reason');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length > 1000) return { fieldErrors: { reason: validationMessages.tooLong(1000) } };
  const supabase = await createClient();
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('cancel_load', {
    p_load_id: loadId,
    p_reason: text || undefined,
  });
  if (error) return { error: loadErrorMessage(error) };
  revalidatePath(paths.shipper, 'layout');
  return {};
}
