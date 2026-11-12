import { useNetInfo } from '@react-native-community/netinfo';
import { mobileSystemCopy } from '@transport/shared';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOffline } from '../lib/network';
import { iconSize, spacing, useTheme } from '../theme';
import { Icon } from './icons';

/**
 * A quiet strip on top of every screen while the device has no connection:
 * the cell colour with a fine line under it, the "pending" mark (it waits on
 * the network, §1.1) and the sentence in the text colour, so the icon and the
 * words say it, not the colour.
 */
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
        {
          backgroundColor: colors.cell,
          borderBottomColor: colors.separator,
          paddingTop: insets.top + spacing.xs,
        },
      ]}
    >
      <Icon name="offline" size={iconSize.small} color={colors.amberText} />
      <Text style={[type.footnote, styles.text, { color: colors.text }]}>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flexShrink: 1, textAlign: 'center' },
});
