import Ionicons from '@expo/vector-icons/Ionicons';
import { mobileNavCopy as nav } from '@transport/shared';
import { Tabs } from 'expo-router/js-tabs';

import { colors } from '../../theme';

/** Operator view: the assigned trip (B21–B23) and the account. */
export default function OperatorTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="trip"
        options={{
          title: nav.assignedTrip,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: nav.more,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
