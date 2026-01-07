import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Masquer le splash screen après le rendu
const hideSplash = () => {
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 400);
  }
};

const root = createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Masquer après un court délai pour s'assurer que l'app est rendue
setTimeout(hideSplash, 100);
