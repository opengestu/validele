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
        // Local backend (dev). Adjust with VITE_DEV_BACKEND env var if your backend runs on a different host/port.
        target: process.env.VITE_DEV_BACKEND || 'http://localhost:5000',
        changeOrigin: true,
        // `secure: false` allows self-signed certs when target is https
        secure: false,
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
