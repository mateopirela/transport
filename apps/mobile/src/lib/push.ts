import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isExpoPushToken, pushSkipReason, type PushSkipReason } from './push-policy';

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'skipped'; reason: PushSkipReason }
  | { status: 'failed' };

/** Where a token is persisted for the signed-in user. */
export type PushTokenSink = (token: string, platform: 'ios' | 'android') => Promise<void>;

/**
 * Asks for notification permission and obtains this device's Expo push token,
 * then hands it to `sink`. Never throws: push is optional and must not block
 * the app. The token is never logged.
 */
export async function registerPushToken(
  projectId: string | null,
  sink: PushTokenSink,
): Promise<PushRegistration> {
  // Do not prompt for permission when no token could be obtained anyway.
  const precondition = pushSkipReason({
    isDevice: Device.isDevice,
    projectId,
    permissionGranted: true,
  });
  if (precondition || !projectId) {
    return { status: 'skipped', reason: precondition ?? 'no_project_id' };
  }

  try {
    if (Platform.OS === 'android') {
      // Android 13+ only shows the permission prompt once a channel exists.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return { status: 'skipped', reason: 'permission_denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!isExpoPushToken(token)) return { status: 'failed' };
    await sink(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return { status: 'registered', token };
  } catch {
    return { status: 'failed' };
  }
}
