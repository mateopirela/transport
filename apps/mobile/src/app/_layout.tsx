import { mobileAuthCopy, mobileSystemCopy } from '@transport/shared';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '../components/offline-banner';
import { Body, Centered, Loading, Notice } from '../components/ui';
import { redirectFor } from '../lib/routing';
import { envResult, supabase } from '../lib/supabase';
import { SessionProvider, useSession } from '../providers/session';
import { colors } from '../theme';

export default function RootLayout() {
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

/** Keeps the user inside the area their session and role allow (lib/routing.ts). */
function GuardedStack() {
  const { area } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const target = redirectFor(area, segments);

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
