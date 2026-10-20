import { Stack } from 'expo-router';

import { useStackScreenOptions } from '../../theme';

/** Carrier area: the tabs plus the fleet detail screens pushed over them (B18). */
export default function CarrierStack() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
