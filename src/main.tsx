import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';

const root = createRoot(
  document.getElementById('root') as HTMLElement
);

// Le splash HTML est retiré uniquement quand l'auth est prête.
const hideSplash = () => {
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 400);
  }
};

window.addEventListener('app:auth-ready', hideSplash, { once: true });

// Ancien service worker PWA retiré : son cache jamais versionné servait
// d'anciens index.html/bundles qui ne connaissaient pas les nouvelles routes
// (ex. /acheter/{code}) et retombaient sur /auth de façon intermittente. Le
// unregister ci-dessous (toutes routes, plus seulement /product/) + le sw.js
// kill-switch nettoient les appareils des utilisateurs existants. Le worker
// réservé au push est conservé : il ne met aucune page en cache.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations
      .filter((registration) => !new URL(registration.scope).pathname.startsWith('/firebase-cloud-messaging-push-scope'))
      .map((registration) => registration.unregister())))
    .catch(() => { /* ignore */ });
  if (typeof caches !== 'undefined' && caches?.keys) {
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => { /* ignore */ });
  }
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
