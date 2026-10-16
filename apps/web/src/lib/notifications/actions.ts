'use server';

import { uuidField } from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { paths } from '../routing';
import { createClient } from '../supabase/server';
import { notificationHref } from './links';

/** Marks every notification of the caller as read. */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc('mark_notifications_read', {});
  revalidatePath(paths.shipper, 'layout');
}

/**
 * Opens a notification: marks it read and goes to its screen. The row is read
 * through RLS (only the owner sees it), so the target comes from the database,
 * never from the form.
 */
export async function openNotification(formData: FormData) {
  const parsed = uuidField.safeParse(formData.get('notificationId'));
  const supabase = await createClient();
  if (!parsed.success || !supabase) redirect(paths.shipperNotifications);

  const { data } = await supabase
    .from('notifications')
    .select('type, data')
    .eq('id', parsed.data)
    .maybeSingle();
  await supabase.rpc('mark_notifications_read', { p_ids: [parsed.data] });
  revalidatePath(paths.shipper, 'layout');
  redirect((data && notificationHref(data.type, data.data)) ?? paths.shipperNotifications);
}
