import { useMemo, type ComponentProps } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomBar, useTabBarClearance } from './ui';

/**
 * The kit's BottomBar on a screen that may sit inside the tabs (the
 * operator's trip, "Mi viaje" of the hombre-camión). Inside the tabs its glass
 * reaches the bottom edge behind the floating tab bar and its actions rest
 * right above the bar, so the two read as one surface; outside them it is the
 * BottomBar itself. The bar keeps reporting its whole height through
 * `onHeight`, which a Screen's `bottom` keeps clear of.
 */
export function TabBottomBar(props: ComponentProps<typeof BottomBar>) {
  const insets = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  // The BottomBar pads its bottom by the phone's inset: in the tabs, by the bar's room instead.
  const lifted = useMemo(() => ({ ...insets, bottom: clearance }), [insets, clearance]);
  if (clearance === 0) return <BottomBar {...props} />;
  return (
    <SafeAreaInsetsContext.Provider value={lifted}>
      <BottomBar {...props} />
    </SafeAreaInsetsContext.Provider>
  );
}
