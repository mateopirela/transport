import { formatDateTime, notificationContent, notificationsInboxCopy } from '@transport/shared';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { markAllNotificationsRead, openNotification } from '@/lib/notifications/actions';
import { notificationHref } from '@/lib/notifications/links';
import { listNotifications, unreadNotificationCount } from '@/lib/notifications/queries';
import type { WebArea } from '@/lib/routing';
import { createClient } from '@/lib/supabase/server';
import type { ViewerDetails } from '@/lib/viewer';
import { cn } from '@/lib/utils';

const c = notificationsInboxCopy;

/**
 * In-app inbox (B07 notifications) of the shipper (B14) and the carrier staff
 * (G10a): newest first, opening one marks it read and goes to its screen in
 * the viewer's area. The page that mounts it has already checked access.
 */
export async function NotificationsInbox({
  viewer,
  area,
  error,
}: {
  viewer: ViewerDetails;
  area: WebArea;
  /** `error` query parameter of the inbox (`leidas`: marking as read failed). */
  error: string | string[] | undefined;
}) {
  const supabase = await createClient();
  if (!supabase) return <Empty title={c.empty} />;
  // The whole unread count, not only the listed page: the badge counts all.
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(supabase, viewer.userId),
    unreadNotificationCount(viewer.userId),
  ]);

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.description}
        action={
          unreadCount > 0 && (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="secondary" size="sm">
                {c.markAllRead}
              </Button>
            </form>
          )
        }
      />
      {error === 'leidas' && (
        <Notice tone="error" className="mb-4">
          {c.markFailed}
        </Notice>
      )}
      {notifications.length === 0 ? (
        <Empty title={c.empty} />
      ) : (
        <Group>
          <ul>
            {notifications.map((notification) => {
              const content = notificationContent(notification.type, notification.data);
              const unread = notification.read_at === null;
              const href = notificationHref(notification.type, notification.data, area);
              return (
                <li
                  key={notification.id}
                  className={cn(
                    groupRow,
                    'flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5',
                    unread && 'bg-accent-soft/40',
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-headline text-text">
                      {content.title}
                      {unread && <Pill tone="accent">{c.unread}</Pill>}
                    </p>
                    <p className="text-subhead text-text-dim">{content.body}</p>
                    <p className="text-footnote text-text-faint tabular-nums">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </div>
                  {(href || unread) && (
                    <form action={openNotification}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        {href ? c.open : c.markRead}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Group>
      )}
    </>
  );
}
