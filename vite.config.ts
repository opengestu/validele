import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path'; // Ajoutez ceci

export default defineConfig({
  plugins: [react()],
  base: './', // Important pour Capacitor - chemins relatifs
  server: {
    https: {
      key: fs.readFileSync('./localhost.key'),
      cert: fs.readFileSync('./localhost.crt'),
    },
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_BACKEND || 'https://validele.onrender.com',
        changeOrigin: true,
        secure: false,
        rewrite: (reqPath) => reqPath,
      },
      '/auth': {
        target: process.env.VITE_DEV_BACKEND || 'https://validele.onrender.com',
        changeOrigin: true,
        secure: false,
        // Ne pas proxyfier les navigations vers la route front "/auth" (React Router),
        // sinon un refresh ou un accès direct à /auth est envoyé au backend et timeout.
        bypass: (req) => {
          if (req.method !== 'GET') return;
          const accept = req.headers.accept;
          const secFetchDest = req.headers['sec-fetch-dest'];
          const wantsHtml = typeof accept === 'string' && accept.includes('text/html');
          const isDocument = secFetchDest === 'document' || wantsHtml;
          if (isDocument) return '/index.html';
        },
        rewrite: (reqPath) => reqPath,
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});


// Option local pour les tests
