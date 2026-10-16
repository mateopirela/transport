import { formatDateTime, notificationContent, notificationsInboxCopy } from '@transport/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { markAllNotificationsRead, openNotification } from '@/lib/notifications/actions';
import { notificationHref } from '@/lib/notifications/links';
import { listNotifications, unreadNotificationCount } from '@/lib/notifications/queries';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

const c = notificationsInboxCopy;

export const metadata: Metadata = { title: c.title };

/** In-app inbox (B07 notifications): newest first, opening one marks it read. */
export default async function NotificationsPage({
  searchParams,
}: PageProps<'/cliente/notificaciones'>) {
  const viewer = await requireAccess(paths.shipperNotifications);
  const supabase = await createClient();
  if (!supabase) notFound();
  const { error } = await searchParams;
  // The whole unread count, not only the listed page: the badge counts all.
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(supabase, viewer.userId),
    unreadNotificationCount(viewer.userId),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={c.title} description={c.description} />
        {unreadCount > 0 && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="outline" size="sm">
              {c.markAllRead}
            </Button>
          </form>
        )}
      </div>
      {error === 'leidas' && (
        <div className="mb-4">
          <Notice tone="error">{c.markFailed}</Notice>
        </div>
      )}
      {notifications.length === 0 ? (
        <p className="text-muted-foreground">{c.empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {notifications.map((notification) => {
            const content = notificationContent(notification.type, notification.data);
            const unread = notification.read_at === null;
            const href = notificationHref(notification.type, notification.data);
            return (
              <li key={notification.id} className={cn('flex gap-4 p-4', unread && 'bg-accent/5')}>
                <div className="flex-1 space-y-1">
                  <p className="font-medium">
                    {content.title}
                    {unread && (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                        {c.unread}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{content.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.created_at)}
                  </p>
                </div>
                {(href || unread) && (
                  <form action={openNotification}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <Button type="submit" variant="outline" size="sm">
                      {href ? c.open : c.markRead}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
