import 'server-only';

import { createClient } from '../supabase/server';
import type { Supabase } from '../viewer';

/** Notifications shown in the inbox (the most recent ones). */
export const NOTIFICATIONS_PAGE_SIZE = 50;

/** Unread notifications of the user, for the badge; 0 when it cannot be read. */
export async function unreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return error ? 0 : (count ?? 0);
}

/** The user's latest notifications, newest first (RLS: only their own). */
export async function listNotifications(supabase: Supabase, userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, data, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(NOTIFICATIONS_PAGE_SIZE);
  if (error) throw new Error(`Notifications query failed: ${error.message}`);
  return data;
}
