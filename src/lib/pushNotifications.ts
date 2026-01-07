import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Registers for push notifications on native (Android/iOS) and returns the FCM token via callback.
 * Safe no-op on web.
 */
export async function setupPushNotifications(
  onToken?: (token: string) => Promise<void> | void
) {
  const platform = Capacitor.getPlatform();
  if (platform === 'web') {
    return; // avoid running on web/PWA where the plugin is unavailable
  }

  const permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive !== 'granted') {
    const req = await PushNotifications.requestPermissions();
    if (req.receive !== 'granted') {
      console.warn('Push permission not granted');
      return;
    }
  }

  // Register with FCM/APNS
  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    try {
      if (onToken) {
        await onToken(token.value);
      }
      console.log('Push token', token.value);
    } catch (err) {
      console.error('Error handling push token', err);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error', err);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received (foreground)', notification);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    console.log('Push action', event);
  });
}
