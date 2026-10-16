import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/** Default refresh of the screens that follow trips on the road (no Realtime on trips). */
export const TRIP_POLL_MS = 60_000;

/**
 * Calls `refresh` every `ms` while the screen has focus. `refresh` must be
 * stable (useCallback). The first load is the loader's own (useLoader).
 */
export function usePolling(refresh: () => void, ms: number = TRIP_POLL_MS) {
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(refresh, ms);
      return () => clearInterval(timer);
    }, [refresh, ms]),
  );
}
