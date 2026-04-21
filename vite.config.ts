import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path'; // Ajoutez ceci

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devBackend = env.VITE_DEV_BACKEND || process.env.VITE_DEV_BACKEND || 'https://localhost:3001';
  const isMobileBuild = mode === 'mobile';

  const copyAssetLinksPlugin = {
    name: 'copy-assetlinks-json',
    closeBundle() {
      const sourcePath = path.resolve(__dirname, './public/.well-known/assetlinks.json');
      const targetDir = path.resolve(__dirname, './dist/.well-known');
      const targetPath = path.resolve(targetDir, './assetlinks.json');

      if (!fs.existsSync(sourcePath)) return;
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    },
  };

  return {
    plugins: [react(), copyAssetLinksPlugin],
    // Web (Cloudflare/SPA): base absolue pour supporter les routes profondes (/product/:code)
    // Mobile (Capacitor): base relative pour charger les assets depuis le bundle local
    base: isMobileBuild ? './' : '/',
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