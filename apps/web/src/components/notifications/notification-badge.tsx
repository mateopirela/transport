'use client';

import { notificationsInboxCopy as c } from '@transport/shared';
import { useCallback, useSyncExternalStore } from 'react';

import { createSharedCounts } from '@/lib/notifications/shared-count';
import { channelTopic, createBrowserSupabase, subscribeAsUser } from '@/lib/supabase/browser';

/**
 * The unread notifications of each user, live: one Realtime subscription
 * however many badges show the count (the sidebar and, while it is open, the
 * menu panel), recounted when Realtime reports a change to their
 * notifications (RLS: only their own rows reach them).
 */
const unreadCounts = createSharedCounts((userId, set) => {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return () => {
      // Without Supabase nothing was opened: the count stays as the server rendered it.
    };
  }
  const recount = async () => {
    const { count: unread, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    if (!error && unread !== null) set(unread);
  };
  return subscribeAsUser(supabase, () =>
    supabase
      .channel(channelTopic(`notifications:${userId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => void recount(),
      )
      .subscribe(),
  );
});

/**
 * Unread notifications of the signed-in user. Starts from the count the
 * server rendered and follows the live one, which every badge of the user
 * shares. A server render with another count resets it.
 */
export function NotificationBadge({
  userId,
  initialCount,
}: {
  userId: string;
  initialCount: number;
}) {
  const subscribe = useCallback(
    (listener: () => void) => unreadCounts.subscribe(userId, initialCount, listener),
    [userId, initialCount],
  );
  const count = useSyncExternalStore(
    subscribe,
    () => unreadCounts.read(userId, initialCount),
    () => initialCount,
  );

  if (count === 0) return null;
  return (
    <span
      className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-caption font-semibold text-accent-ink tabular-nums"
      aria-label={c.badgeLabel(count)}
    >
      {c.badge(count)}
    </span>
  );
}
