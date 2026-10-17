'use server';

import { isCarrierStaff, uuidField } from '@transport/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { paths, type WebArea } from '../routing';
import { getViewer } from '../session';
import { createClient } from '../supabase/server';
import { notificationHref } from './links';

/** The inbox of the viewer's area: the carrier staff's (G10a) or the shipper's (B14). */
async function inboxOf(): Promise<{ area: WebArea; home: string; inbox: string }> {
  const viewer = await getViewer();
  return isCarrierStaff(viewer?.role)
    ? { area: 'transportista', home: paths.carrier, inbox: paths.carrierNotifications }
    : { area: 'cliente', home: paths.shipper, inbox: paths.shipperNotifications };
}

/** Marks every notification of the caller as read. */
export async function markAllNotificationsRead() {
  const { home, inbox } = await inboxOf();
  // The inbox showing that marking as read failed (the page explains it).
  const failedPath = `${inbox}?error=leidas`;
  const supabase = await createClient();
  const { error } = supabase ? await supabase.rpc('mark_notifications_read', {}) : { error: true };
  revalidatePath(home, 'layout');
  if (error) redirect(failedPath);
  redirect(inbox);
}

/**
 * Opens a notification: marks it read and goes to its screen. The row is read
 * through RLS (only the owner sees it), so the target comes from the database,
 * never from the form. If it cannot be marked, the inbox says so instead.
 */
export async function openNotification(formData: FormData) {
  const { area, home, inbox } = await inboxOf();
  const failedPath = `${inbox}?error=leidas`;
  const parsed = uuidField.safeParse(formData.get('notificationId'));
  const supabase = await createClient();
  if (!parsed.success || !supabase) redirect(failedPath);

  const { data } = await supabase
    .from('notifications')
    .select('type, data')
    .eq('id', parsed.data)
    .maybeSingle();
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: [parsed.data] });
  revalidatePath(home, 'layout');
  if (!data || error) redirect(failedPath);
  redirect(notificationHref(data.type, data.data, area) ?? inbox);
}
