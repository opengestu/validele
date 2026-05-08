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

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  const pathname = (typeof window !== 'undefined' ? window.location.pathname : '').toLowerCase();
  const isProductLinkRoute = pathname.startsWith('/product/');

  if (isProductLinkRoute) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {
        // ignore unregister errors on deep-link landing pages
      });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[PWA] Service worker registration failed:', error);
      });
    });
  }
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
