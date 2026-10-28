import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:8080';
  return {
    plugins: [
      react(),
      // PWA: precachea la app para que abra sin red; los datos se cachean en IndexedDB (src/lib/offline.ts).
      // Instalable en el sistema operativo; las notificaciones push las atiende public/push-sw.js (importado en el SW).
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: 'Banco de Talentos', short_name: 'Talentos', lang: 'es', display: 'standalone',
          start_url: '/', theme_color: '#009688', background_color: '#ffffff',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          importScripts: ['push-sw.js'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/integration\//],
          runtimeCaching: [
            { urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/public/'), handler: 'StaleWhileRevalidate', options: { cacheName: 'bdt-public' } },
            { urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com', handler: 'CacheFirst', options: { cacheName: 'bdt-fonts' } },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      strictPort: true,
      // En local el front y la API comparten origen vía proxy (cookies same-site)
      proxy: { '/api': apiTarget, '/integration': apiTarget },
    },
    preview: { port: 4173, proxy: { '/api': apiTarget, '/integration': apiTarget } },
  };
});
