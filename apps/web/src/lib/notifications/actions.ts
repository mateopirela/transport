'use server';

import { uuidField } from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { paths } from '../routing';
import { createClient } from '../supabase/server';
import { notificationHref } from './links';

/** The inbox showing that marking as read failed (the page explains it). */
const failedPath = `${paths.shipperNotifications}?error=leidas`;

/** Marks every notification of the caller as read. */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { error } = supabase ? await supabase.rpc('mark_notifications_read', {}) : { error: true };
  revalidatePath(paths.shipper, 'layout');
  if (error) redirect(failedPath);
  redirect(paths.shipperNotifications);
}

/**
 * Opens a notification: marks it read and goes to its screen. The row is read
 * through RLS (only the owner sees it), so the target comes from the database,
 * never from the form. If it cannot be marked, the inbox says so instead.
 */
export async function openNotification(formData: FormData) {
  const parsed = uuidField.safeParse(formData.get('notificationId'));
  const supabase = await createClient();
  if (!parsed.success || !supabase) redirect(failedPath);

  const { data } = await supabase
    .from('notifications')
    .select('type, data')
    .eq('id', parsed.data)
    .maybeSingle();
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: [parsed.data] });
  revalidatePath(paths.shipper, 'layout');
  if (!data || error) redirect(failedPath);
  redirect(notificationHref(data.type, data.data) ?? paths.shipperNotifications);
}
