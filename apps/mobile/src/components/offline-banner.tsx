import { useNetInfo } from '@react-native-community/netinfo';
import { mobileSystemCopy } from '@transport/shared';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOffline } from '../lib/network';
import { colors, spacing } from '../theme';

/** Banner shown on top of every screen while the device has no connection. */
export function OfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  if (!isOffline(netInfo)) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}
    >
      <Text style={styles.text}>{mobileSystemCopy.offline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  text: { color: colors.onAccent, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
