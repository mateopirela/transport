import Ionicons from '@expo/vector-icons/Ionicons';
import { mobileNavCopy as nav } from '@transport/shared';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';

import { colors } from '../../../theme';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
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
    </Tabs>
  );
}
