import { formatDateTime, notificationContent, notificationsInboxCopy } from '@transport/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeading } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { markAllNotificationsRead, openNotification } from '@/lib/notifications/actions';
import { notificationHref } from '@/lib/notifications/links';
import { listNotifications } from '@/lib/notifications/queries';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

const c = notificationsInboxCopy;

export const metadata: Metadata = { title: c.title };

/** In-app inbox (B07 notifications): newest first, opening one marks it read. */
export default async function NotificationsPage() {
  const viewer = await requireAccess(paths.shipperNotifications);
  const supabase = await createClient();
  if (!supabase) notFound();
  const notifications = await listNotifications(supabase, viewer.userId);
  const anyUnread = notifications.some((n) => n.read_at === null);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={c.title} description={c.description} />
        {anyUnread && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="outline" size="sm">
              {c.markAllRead}
            </Button>
          </form>
        )}
      </div>
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
