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
