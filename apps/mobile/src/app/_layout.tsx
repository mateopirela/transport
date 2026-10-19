import { errorBoundaryCopy, mobileAuthCopy, mobileSystemCopy } from '@transport/shared';
import { Stack, usePathname, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '../components/offline-banner';
import { Body, Button, Centered, Loading, Notice } from '../components/ui';
import { usePushNavigation } from '../lib/push';
import { resolveRedirect } from '../lib/routing';
import { reportError, withSentry } from '../lib/sentry';
import { envResult, supabase } from '../lib/supabase';
import { SessionProvider, useSession } from '../providers/session';
import { colors } from '../theme';

function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <OfflineBanner />
        {supabase && envResult.ok ? (
          <SessionProvider client={supabase} easProjectId={envResult.env.easProjectId}>
            <GuardedStack />
          </SessionProvider>
        ) : (
          <Centered>
            <Notice tone="danger" title={mobileSystemCopy.missingConfigTitle}>
              <Body>{mobileSystemCopy.missingConfigBody}</Body>
            </Notice>
          </Centered>
        )}
      </View>
    </SafeAreaProvider>
  );
}

export default withSentry(RootLayout);

/**
 * Error boundary of every screen (B25; Expo Router uses the one of the
 * nearest layout). Spanish message and a retry; the error goes to Sentry.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const [retrying, setRetrying] = useState(false);
  useEffect(() => reportError(error, { boundary: 'root' }), [error]);
  return (
    <SafeAreaProvider>
      <Centered>
        <Notice tone="danger" title={errorBoundaryCopy.title}>
          <Body>{errorBoundaryCopy.body}</Body>
        </Notice>
        <Button
          label={errorBoundaryCopy.retry}
          loading={retrying}
          onPress={() => {
            setRetrying(true);
            void retry().finally(() => setRetrying(false));
          }}
        />
      </Centered>
    </SafeAreaProvider>
  );
}

/**
 * Keeps the user inside the area their session and role allow (lib/routing.ts),
 * bringing them back to a shared load (G7) they opened before signing in.
 */
function GuardedStack() {
  const { area } = useSession();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const [pendingShared, setPendingShared] = useState<string | null>(null);
  const { target, pending } = resolveRedirect(area, segments, pathname, pendingShared);
  // Adjusting state while rendering (React's pattern for derived state).
  if (pending !== pendingShared) setPendingShared(pending);
  // A tapped push opens its trip once the user is inside their area.
  usePushNavigation(target === null ? area : 'loading');

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      {area === 'loading' ? (
        <View style={StyleSheet.absoluteFill}>
          <Loading label={mobileAuthCopy.loading} />
        </View>
      ) : null}
    </View>
  );
}
