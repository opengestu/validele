import React from 'react';
import { createRoot } from 'react-dom/client';
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

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
