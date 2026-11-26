import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: 'Agroexportadora — Reclutamiento',
        short_name: 'Agroexportadora',
        description: 'Sistema de Reclutamiento Empresa Agroexportadora',
        start_url: '/app/login',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2d8c2d',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cachea los assets del bundle
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        // Estrategia NetworkFirst para la API del reclutador — offline con cache de 10 min
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/postulantes\/mis-asignados/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-mis-asignados',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/v1\/dashboard\/reclutador/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-dashboard-reclutador',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // Sólo desarrollo. En producción manda vercel.json, que reescribe /api/*
  // hacia Railway. Los puertos 4000 y 5173 los ocupa Incidencias cuando se
  // levantan varios sistemas de Agroexportadora en la misma máquina.
  server: {
    port: 5373,
    proxy: {
      '/api': {
        target: 'http://localhost:4300',
        changeOrigin: true,
      },
    },
  },
});
