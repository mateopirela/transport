'use client';

import { notificationsInboxCopy as c } from '@transport/shared';
import { useEffect, useState } from 'react';

import { channelTopic, createBrowserSupabase, subscribeAsUser } from '@/lib/supabase/browser';

/**
 * Unread notifications of the signed-in user. Starts from the count the
 * server rendered and recounts when Realtime reports a change to their
 * notifications (RLS: only their own rows reach them). The parent keys it by
 * the server count, so a server render resets it.
 */
export function NotificationBadge({
  userId,
  initialCount,
}: {
  userId: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const recount = async () => {
      const { count: unread, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);
      if (!error && unread !== null) setCount(unread);
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
  }, [userId]);

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
