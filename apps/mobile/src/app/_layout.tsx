import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { errorBoundaryCopy, mobileAuthCopy, mobileSystemCopy } from '@transport/shared';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { OfflineBanner } from '../components/offline-banner';
import { Button, Loading, Notice } from '../components/ui';
import { usePushNavigation } from '../lib/push';
import { resolveRedirect } from '../lib/routing';
import { reportError, withSentry } from '../lib/sentry';
import { envResult, supabase } from '../lib/supabase';
import { SessionProvider, useSession } from '../providers/session';
import { fontFiles, spacing, ThemeProvider, useStackScreenOptions, useTheme } from '../theme';

// Hanken Grotesk loads before the first screen shows (D26).
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootLayout() {
  return (
    // Gestures of the bottom sheets (components/sheet.tsx).
    <GestureHandlerRootView style={styles.flex}>
      <ThemeProvider>
        <ThemedRoot />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function ThemedRoot() {
  const { theme, box, ready: themeReady } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  // The splash stays until the font and the saved theme are in. Without the
  // font (a failed load) the app still opens, on the system font.
  const ready = themeReady && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      {/* Dark icons on the light page, light icons on the dark one. */}
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <View style={box.page}>
        <OfflineBanner />
        {supabase && envResult.ok ? (
          <SessionProvider client={supabase} easProjectId={envResult.env.easProjectId}>
            <BottomSheetModalProvider>
              <GuardedStack />
            </BottomSheetModalProvider>
          </SessionProvider>
        ) : (
          <SafeAreaView style={styles.message}>
            <Notice tone="danger" title={mobileSystemCopy.missingConfigTitle}>
              {mobileSystemCopy.missingConfigBody}
            </Notice>
          </SafeAreaView>
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
  const { box } = useTheme();
  useEffect(() => reportError(error, { boundary: 'root' }), [error]);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[box.page, styles.message]}>
        <Notice tone="danger" title={errorBoundaryCopy.title}>
          {errorBoundaryCopy.body}
        </Notice>
        <Button
          label={errorBoundaryCopy.retry}
          loading={retrying}
          onPress={() => {
            setRetrying(true);
            void retry().finally(() => setRetrying(false));
          }}
        />
      </SafeAreaView>
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
  const screenOptions = useStackScreenOptions();
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
    <View style={styles.flex}>
      <Stack screenOptions={{ ...screenOptions, headerShown: false }} />
      {area === 'loading' ? <SessionLoading /> : null}
    </View>
  );
}

/** While the session is read: the page with the shape of a list, over whatever is under it. */
function SessionLoading() {
  const { box } = useTheme();
  return (
    <SafeAreaView style={[StyleSheet.absoluteFill, box.page, styles.loading]}>
      <Loading label={mobileAuthCopy.loading} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  message: { flex: 1, justifyContent: 'center', padding: spacing.md, gap: spacing.md },
  loading: { padding: spacing.md },
});
