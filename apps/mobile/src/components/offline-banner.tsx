import { useNetInfo } from '@react-native-community/netinfo';
import { mobileSystemCopy } from '@transport/shared';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOffline } from '../lib/network';
import { iconSize, spacing, useTheme } from '../theme';
import { Icon } from './icons';

/** A quiet strip on top of every screen while the device has no connection: amber on the highlight. */
export function OfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  const { colors, type } = useTheme();
  if (!isOffline(netInfo)) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        { backgroundColor: colors.highlight, paddingTop: insets.top + spacing.xs },
      ]}
    >
      <Icon name="offline" size={iconSize.small} color={colors.amberText} />
      <Text style={[type.label, styles.text, { color: colors.amberText }]}>
        {mobileSystemCopy.offline}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  text: { flexShrink: 1, textAlign: 'center' },
});
