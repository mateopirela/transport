/** Subset of NetInfo's state used to decide whether to show the offline banner. */
export interface ConnectivityState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

/**
 * Offline only when NetInfo is sure: `null` means "still unknown" (e.g. right
 * after launch) and must not flash the banner.
 */
export function isOffline({ isConnected, isInternetReachable }: ConnectivityState): boolean {
  return isConnected === false || isInternetReachable === false;
}
