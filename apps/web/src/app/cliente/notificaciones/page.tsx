import { notificationsInboxCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { NotificationsInbox } from '@/components/notifications/inbox';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

export const metadata: Metadata = { title: notificationsInboxCopy.title };

/** The shipper's inbox (B14). */
export default async function NotificationsPage({
  searchParams,
}: PageProps<'/cliente/notificaciones'>) {
  const viewer = await requireAccess(paths.shipperNotifications);
  const { error } = await searchParams;
  return <NotificationsInbox viewer={viewer} area="cliente" error={error} />;
}
