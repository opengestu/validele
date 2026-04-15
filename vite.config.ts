import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path'; // Ajoutez ceci

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devBackend = env.VITE_DEV_BACKEND || process.env.VITE_DEV_BACKEND || 'https://localhost:3001';
  const enableCloudflarePlugin = mode !== 'development';

  return {
    plugins: [react(), ...(enableCloudflarePlugin ? [cloudflare()] : [])],
    base: './', // Important pour Capacitor - chemins relatifs
    server: {
      https: {
        key: fs.readFileSync('./localhost.key'),
        cert: fs.readFileSync('./localhost.crt'),
      },
      proxy: {
        '/api': {
          target: devBackend,
          changeOrigin: true,
          secure: false,
          rewrite: (reqPath) => reqPath,
        },
        '/auth': {
          target: devBackend,
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
  };
});


// Option local pour les tests