import { notificationsInboxCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { NotificationsInbox } from '@/components/notifications/inbox';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

export const metadata: Metadata = { title: notificationsInboxCopy.title };

/** The carrier staff's inbox (G10a). */
export default async function CarrierNotificationsPage({
  searchParams,
}: PageProps<'/transportista/notificaciones'>) {
  const viewer = await requireAccess(paths.carrierNotifications);
  const { error } = await searchParams;
  return <NotificationsInbox viewer={viewer} area="transportista" error={error} />;
}
