import * as Location from 'expo-location';

// Foreground location for trip status events (B21, D11). Only read when the
// operator records an action: nothing is tracked here (background tracking
// and its consent are B22).

export interface DevicePosition {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

export type PositionResult =
  { ok: true; position: DevicePosition } | { ok: false; reason: 'denied' | 'unavailable' };

/** A fix older than this is not used for an event. */
const MAX_LAST_KNOWN_AGE_MS = 5 * 60 * 1000;
const FIX_TIMEOUT_MS = 15_000;

function toPosition({ coords }: Location.LocationObject): DevicePosition {
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    // The RPCs accept 0..100 km; anything else is dropped rather than refused.
    accuracyM:
      coords.accuracy !== null && coords.accuracy >= 0 && coords.accuracy <= 100_000
        ? coords.accuracy
        : null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Current position, asking for the "while in use" permission if needed. GPS
 * works without data connection, so this also works offline. `ask: false`
 * never shows the system prompt (optional locations, e.g. incidents).
 */
export async function currentPosition({ ask = true } = {}): Promise<PositionResult> {
  const permission = ask
    ? await Location.requestForegroundPermissionsAsync()
    : await Location.getForegroundPermissionsAsync();
  if (!permission.granted) return { ok: false, reason: 'denied' };

  const fix = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    FIX_TIMEOUT_MS,
  );
  if (fix) return { ok: true, position: toPosition(fix) };

  const last = await Location.getLastKnownPositionAsync({ maxAge: MAX_LAST_KNOWN_AGE_MS }).catch(
    () => null,
  );
  return last ? { ok: true, position: toPosition(last) } : { ok: false, reason: 'unavailable' };
}
