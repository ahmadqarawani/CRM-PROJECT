import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Dev: Vite proxies /api to Django so the browser sees ONE origin (like nginx in prod).
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BGI CRM', short_name: 'BGI CRM', lang: 'ar', dir: 'rtl', start_url: '/', display: 'standalone',
        theme_color: '#0b2e4a', background_color: '#f5f6f8',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // never cache the API, admin or file downloads: always live data
      workbox: { navigateFallbackDenylist: [/^\/api/, /^\/admin/, /^\/static/] },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/admin': { target: backend, changeOrigin: false },
      '/static': { target: backend, changeOrigin: false },
    },
  },
})
