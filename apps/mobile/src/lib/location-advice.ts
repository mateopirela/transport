import { locationAdvice, type LocationAdvice, type LocationPrecision } from '@transport/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// D17: the operator's location must be precise and "Always" so the
// coordinator and the shipper see the trip. The permission and its precision
// come from expo-location (iOS 14+ `ios.accuracy`, Android `android.accuracy`).

function precision(permission: Location.LocationPermissionResponse): LocationPrecision | null {
  const accuracy = permission.ios?.accuracy ?? permission.android?.accuracy;
  if (accuracy === 'full' || accuracy === 'fine') return 'precise';
  if (accuracy === 'reduced' || accuracy === 'coarse') return 'approximate';
  return null;
}

/** Reads the permissions now; a failure counts as no location. */
export async function readLocationAdvice(): Promise<LocationAdvice> {
  try {
    const [foreground, background] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    return locationAdvice({
      foreground: foreground.granted,
      background: background.granted,
      accuracy: precision(foreground),
    });
  } catch {
    return 'denied';
  }
}

/**
 * The current advice, read again whenever the app comes back to the
 * foreground (the operator changes it in the settings). null while reading.
 */
export function useLocationAdvice(): LocationAdvice | null {
  const [advice, setAdvice] = useState<LocationAdvice | null>(null);
  useEffect(() => {
    let active = true;
    const check = () => {
      void readLocationAdvice().then((next) => {
        if (active) setAdvice(next);
      });
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return advice;
}
