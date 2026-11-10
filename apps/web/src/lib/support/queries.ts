import 'server-only';

import { parseSupportSettings, type SupportSettings } from '@transport/shared';

import { createClient } from '../supabase/server';

const NONE: SupportSettings = { whatsapp: null, hours: null };

/**
 * The support settings (I2, D41) as the signed-in user reads them. Without
 * Supabase, without a session or on a failed query there is no number and
 * "Ayuda" does not show: the shell never fails because of it.
 */
export async function loadSupportSettings(): Promise<SupportSettings> {
  const supabase = await createClient();
  if (!supabase) return NONE;
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value')
    .like('key', 'support.%');
  if (error) return NONE;
  return parseSupportSettings(data);
}
