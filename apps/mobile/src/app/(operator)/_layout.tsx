import { mobileNavCopy as nav } from '@transport/shared';
import { Tabs } from 'expo-router/js-tabs';

import type { IconName } from '../../components/icons';
import { TabBar } from '../../components/tab-bar';
import { TabScreens } from '../../components/ui';
import { useTabsScreenOptions } from '../../theme';

const ICONS: Record<string, IconName> = { trip: 'navigate', account: 'more' };

/** Operator view: the assigned trip (B21–B23) and the account. */
export default function OperatorTabs() {
  const screenOptions = useTabsScreenOptions();
  return (
    <TabScreens>
      <Tabs screenOptions={screenOptions} tabBar={(props) => <TabBar {...props} icons={ICONS} />}>
        <Tabs.Screen name="trip" options={{ title: nav.assignedTrip }} />
        <Tabs.Screen name="account" options={{ title: nav.more }} />
        {/* Opened from the trip and the account (B22); not a tab. */}
        <Tabs.Screen name="location-consent" options={{ href: null }} />
      </Tabs>
    </TabScreens>
  );
}
