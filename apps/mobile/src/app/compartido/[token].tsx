import { Redirect, useLocalSearchParams } from 'expo-router';

import { shareTokenParam } from '../../lib/share-api';

/**
 * Deep link of a load shared with the team (G7): transport://compartido/<token>
 * is the same path as the web (/transportista/compartido/<token>) and opens
 * the `shared/[token]` screen. The root layout asks to sign in first when
 * there is no session (lib/routing.ts).
 */
export default function SharedDeepLink() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = shareTokenParam(params.token);
  return <Redirect href={`/shared/${encodeURIComponent(token)}`} />;
}
