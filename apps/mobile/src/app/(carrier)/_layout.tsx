import { Stack } from 'expo-router';

import { colors } from '../../theme';

/** Carrier area: the tabs plus the fleet detail screens pushed over them (B18). */
export default function CarrierStack() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.navy },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
