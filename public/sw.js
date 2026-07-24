// Service worker "kill-switch".
//
// L'ancien SW mettait /index.html en cache dans un cache jamais versionné
// ('validel-pwa-static-v1') : comme sw.js ne changeait jamais, le navigateur ne
// réinstallait jamais le SW et chaque appareil gardait un index.html + bundle
// figés à sa première visite. Sur les nouvelles routes (ex. /acheter/{code}),
// ces vieilles versions ne connaissaient pas la route -> retombaient sur / puis
// /auth, de façon intermittente (selon que le réseau répondait ou non).
//
// Ce fichier ayant un contenu différent, le navigateur le réinstalle chez TOUS
// les utilisateurs à leur prochaine visite : il purge alors tous les caches,
// se désenregistre et recharge les pages contrôlées. Plus aucun cache SW.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (e) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (e) { /* ignore */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    } catch (e) { /* ignore */ }
  })());
});
