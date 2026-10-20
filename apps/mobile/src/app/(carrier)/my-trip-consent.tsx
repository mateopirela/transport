// Location consent of a hombre-camión (D13, G2), opened from "Mi viaje": the
// operator's consent screen under the carrier stack's header, which keeps only
// its back button (the screen opens with its own large title).
import { Stack } from 'expo-router';

import LocationConsentScreen from '../(operator)/location-consent';

export default function MyTripConsentScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <LocationConsentScreen belowHeader />
    </>
  );
}
