export type PushSkipReason = 'no_project_id' | 'not_a_device' | 'permission_denied';

/**
 * Whether the app can ask Expo for a push token. Without an EAS project id
 * (no account yet) or on a simulator there is no token: the app keeps working
 * without push notifications.
 */
export function pushSkipReason({
  isDevice,
  projectId,
  permissionGranted,
}: {
  isDevice: boolean;
  projectId: string | null;
  permissionGranted: boolean;
}): PushSkipReason | null {
  if (!projectId) return 'no_project_id';
  if (!isDevice) return 'not_a_device';
  if (!permissionGranted) return 'permission_denied';
  return null;
}

/** Expo push tokens look like `ExponentPushToken[...]` (or `ExpoPushToken[...]`). */
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/u.test(token);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Screen a tapped push opens. */
export type PushTarget =
  | { pathname: '/trip' }
  | { pathname: '/trip/[id]'; params: { id: string } }
  | { pathname: '/vehicle/[id]'; params: { id: string } };

/**
 * Where a tapped notification leads (notify_trip_event puts the `tripId` in
 * the push data): the operator's assigned trip, or the carrier's trip detail;
 * the unit to release for the carrier staff (G5).
 * Anything else stays where it is. The data comes from the push payload, so
 * only a well-formed id is used; RLS decides what the screen can show.
 */
export function pushTarget(data: unknown, area: string): PushTarget | null {
  const ids = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  // A unit to release, or released (G5): its screen, where the staff releases it.
  const vehicleId = ids.vehicleId;
  if (
    area === 'carrier' &&
    typeof ids.taskId === 'string' &&
    typeof vehicleId === 'string' &&
    UUID.test(vehicleId)
  ) {
    return { pathname: '/vehicle/[id]', params: { id: vehicleId } };
  }
  const tripId = ids.tripId;
  if (typeof tripId !== 'string' || !UUID.test(tripId)) return null;
  if (area === 'operator') return { pathname: '/trip' };
  if (area === 'carrier') return { pathname: '/trip/[id]', params: { id: tripId } };
  return null;
}
