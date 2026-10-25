import { tripLinkCopy, tripLinkDestination } from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { Button, LoadError, Loading, Notice, Screen } from '../../components/ui';
import { shareTokenParam } from '../../lib/share-api';
import { supabase } from '../../lib/supabase';
import { openTripLink } from '../../lib/trip-link-api';
import { useLoader } from '../../lib/use-loader';
import { useSession } from '../../providers/session';

const copy = tripLinkCopy.app;

/**
 * The trip link of the operator (H2, D29): transport://viaje/<token> (or the
 * universal link https://<sitio>/viaje/<token>). Without a session the root
 * layout remembers it, asks to sign in and comes back (lib/routing.ts). With
 * one, open_trip_operator_link decides: the assigned operator goes to their
 * trip, the staff of the unit to the trip detail, anyone else sees that the
 * link is no longer available.
 */
export default function TripLink() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = shareTokenParam(params.token);
  const { area } = useSession();
  const router = useRouter();

  const open = useCallback(
    () => (supabase ? openTripLink(supabase, token) : Promise.resolve(null)),
    [token],
  );
  const { state, reload } = useLoader(open);
  const link = state.status === 'ready' ? state.data : null;

  useEffect(() => {
    if (!link || (area !== 'operator' && area !== 'carrier')) return;
    const to = tripLinkDestination(link, area);
    const href: Href = { pathname: to.pathname as Href & string, params: to.params };
    router.replace(href);
  }, [link, area, router]);

  const header = <Stack.Screen options={{ title: '', headerShown: true }} />;
  return (
    <Screen belowHeader>
      {header}
      {state.status === 'error' ? (
        <LoadError onRetry={() => void reload()} />
      ) : state.status === 'ready' && !link ? (
        <>
          <Notice tone="warning" title={copy.unavailableTitle}>
            {copy.unavailable}
          </Notice>
          <Button
            label={copy.goHome}
            variant="secondary"
            onPress={() => router.replace(area === 'carrier' ? '/home' : '/trip')}
          />
        </>
      ) : (
        <Loading label={copy.opening} />
      )}
    </Screen>
  );
}
