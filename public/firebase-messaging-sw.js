// Push only: never intercept navigation or cache application files.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload) return;
  event.waitUntil(self.registration.showNotification(payload.notification?.title || 'Validèl', {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192.png',
    data: payload.data || {},
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.notification.data?.click_action;
  const route = action === 'OPEN_VENDOR_DASHBOARD' ? '/vendor'
    : action === 'OPEN_DELIVERY_DASHBOARD' ? '/delivery' : '/buyer';
  const target = new URL(route, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
