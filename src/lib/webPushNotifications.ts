import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
export const webPushConfigured = Boolean(vapidKey && Object.values(config).every(Boolean));

export async function webPushSupported() {
  return window.isSecureContext && 'Notification' in window &&
    'serviceWorker' in navigator && await isSupported();
}

export async function registerWebPush() {
  if (!webPushConfigured || !await webPushSupported()) throw new Error('Notifications indisponibles sur ce navigateur.');
  if (Notification.permission !== 'granted') throw new Error('Autorisation des notifications requise.');
  const app = getApps().find((app) => app.name === 'web-push') || initializeApp(config, 'web-push');
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope',
    updateViaCache: 'none',
  });
  // This worker intentionally has no fetch handler or offline cache.
  if (!registration.active) {
    await new Promise<void>((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      if (!worker) return reject(new Error('Service de notifications indisponible.'));
      const timeout = window.setTimeout(() => reject(new Error('Activation des notifications trop longue.')), 15000);
      const check = () => {
        if (worker.state === 'activated' || worker.state === 'redundant') {
          clearTimeout(timeout);
          worker.removeEventListener('statechange', check);
          if (worker.state === 'activated') resolve();
          else reject(new Error('Activation des notifications échouée.'));
        }
      };
      worker.addEventListener('statechange', check);
      check();
    });
  }
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Impossible d’activer les notifications.');
  return { token, messaging, registration };
}

