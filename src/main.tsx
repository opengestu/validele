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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[PWA] Service worker registration failed:', error);
    });
  });
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
