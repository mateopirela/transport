import Ionicons from '@expo/vector-icons/Ionicons';
import { mobileNavCopy as nav } from '@transport/shared';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';

import { useSession } from '../../../providers/session';
import { useTabsScreenOptions } from '../../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Carrier tabs as in the deck's mockup: Inicio, Unidades, Cargas, Viajes, Más.
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'home', title: nav.home, icon: 'home-outline' },
  { name: 'units', title: nav.units, icon: 'bus-outline' },
  { name: 'loads', title: nav.loads, icon: 'cube-outline' },
  { name: 'trips', title: nav.trips, icon: 'map-outline' },
  { name: 'more', title: nav.more, icon: 'menu-outline' },
];

export default function CarrierTabs() {
  // A hombre-camión (D13) also drives: the operator's trip screen as "Mi viaje".
  const ownerOperator = useSession().profile?.isOwnerOperator === true;
  const screenOptions = useTabsScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} color={color} size={size} />,
          }}
        />
      ))}
      <Tabs.Screen
        name="my-trip"
        options={{
          title: nav.myTrip,
          href: ownerOperator ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
