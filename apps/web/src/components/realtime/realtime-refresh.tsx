'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { channelTopic, createBrowserSupabase, subscribeAsUser } from '@/lib/supabase/browser';

/** Changes arriving together (an acceptance closes several offers) refresh once. */
const DEBOUNCE_MS = 400;

/**
 * Re-renders the current page (server data) when rows of a table change.
 * Realtime only delivers rows the user may select (RLS), so the event is just
 * a signal: the page reloads its data through the usual queries. Without
 * Supabase or Realtime the page still works; it only stops updating by itself.
 */
export function RealtimeRefresh({
  table,
  column,
  value,
}: {
  table: 'offers';
  column: 'load_id' | 'negotiation_id';
  value: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeAsUser(supabase, () =>
      supabase
        .channel(channelTopic(`refresh:${table}:${column}:${value}`))
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `${column}=eq.${value}` },
          () => {
            clearTimeout(timer);
            timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
          },
        )
        .subscribe(),
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [router, table, column, value]);

  return null;
}
