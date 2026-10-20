import { mobileNavCopy as nav } from '@transport/shared';
import { Tabs } from 'expo-router/js-tabs';

import type { IconName } from '../../../components/icons';
import { TabBar } from '../../../components/tab-bar';
import { TabScreens } from '../../../components/ui';
import { useSession } from '../../../providers/session';
import { useTabsScreenOptions } from '../../../theme';

// Carrier tabs as in the deck's mockup: Inicio, Unidades, Cargas, Viajes, Más.
const TABS: { name: string; title: string }[] = [
  { name: 'home', title: nav.home },
  { name: 'units', title: nav.units },
  { name: 'loads', title: nav.loads },
  { name: 'trips', title: nav.trips },
  { name: 'more', title: nav.more },
];

const ICONS: Record<string, IconName> = {
  home: 'home',
  units: 'units',
  loads: 'loads',
  trips: 'trips',
  more: 'more',
  'my-trip': 'navigate',
};

export default function CarrierTabs() {
  // A hombre-camión (D13) also drives: the operator's trip screen as "Mi viaje".
  const ownerOperator = useSession().profile?.isOwnerOperator === true;
  const screenOptions = useTabsScreenOptions();
  return (
    <TabScreens>
      <Tabs screenOptions={screenOptions} tabBar={(props) => <TabBar {...props} icons={ICONS} />}>
        {TABS.map(({ name, title }) => (
          <Tabs.Screen key={name} name={name} options={{ title }} />
        ))}
        <Tabs.Screen
          name="my-trip"
          options={{ title: nav.myTrip, href: ownerOperator ? undefined : null }}
        />
      </Tabs>
    </TabScreens>
  );
}
